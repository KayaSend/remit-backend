import { FastifyInstance } from 'fastify';
import { pool } from '../services/database.js';
import { redis, withIdempotency } from '../services/redis.js'; // import

interface PretiumWebhookPayload {
  transaction_code: string;
  status: 'success' | 'failed';
  amount_usdc: string;
  tx_hash: string;
  chain: string;
}

export async function pretiumWebhookRoutes(fastify: FastifyInstance) {
  fastify.post('/webhooks/pretium', async (req, reply) => {
    const payload = req.body as PretiumWebhookPayload;

    if (!payload?.transaction_code) {
      return reply.code(400).send({ error: 'Missing transaction_code' });
    }

    return withIdempotency(req, reply, 'pretium', payload.transaction_code, async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // New flow: funding intent (escrow created after confirmation)
        const intentRes = await client.query(
          `SELECT * FROM escrow_funding_intents WHERE pretium_transaction_code = $1 FOR UPDATE`,
          [payload.transaction_code],
        );

        if (intentRes.rows.length) {
          const intent = intentRes.rows[0];

          if (payload.status !== 'success') {
            await client.query(
              `UPDATE escrow_funding_intents
               SET status = 'failed', webhook_payload = $1, failed_at = NOW(), error_message = 'Pretium reported failure', updated_at = NOW()
               WHERE intent_id = $2`,
              [payload, intent.intent_id],
            );
            await client.query('COMMIT');
            return reply.code(200).send({ ok: true });
          }

          const receivedUsdCents = Math.round(Number(payload.amount_usdc) * 100);
          if (receivedUsdCents < Number(intent.expected_usdc_cents)) {
            throw new Error(
              `Underfunded intent: expected=${intent.expected_usdc_cents}, received=${receivedUsdCents}`,
            );
          }

          // Create escrow now (single transaction)
          const escrowRes = await client.query(
            `INSERT INTO escrows (
               sender_user_id,
               recipient_id,
               total_amount_usd_cents,
               remaining_balance_usd_cents,
               total_spent_usd_cents,
               status,
               expires_at,
               memo,
               funded_at,
               activated_at
             )
             VALUES (
               $1,
               (SELECT recipient_id FROM recipients WHERE phone_number_encrypted = $2 LIMIT 1),
               $3,
               $3,
               0,
               'active',
               NOW() + INTERVAL '90 days',
               $4,
               NOW(),
               NOW()
             )
             RETURNING escrow_id`,
            [
              intent.sender_user_id,
              intent.recipient_phone,
              Number(intent.total_amount_usd_cents),
              intent.memo,
            ],
          );

          const escrowId = escrowRes.rows[0].escrow_id;

          // Insert categories from intent payload
          const cats = Array.isArray(intent.categories) ? intent.categories : intent.categories?.categories;
          const parsedCats = Array.isArray(cats)
            ? cats
            : (typeof intent.categories === 'string' ? JSON.parse(intent.categories) : intent.categories);

          const categories = Array.isArray(parsedCats) ? parsedCats : [];
          for (const c of categories) {
            const name = String(c?.name ?? '').toLowerCase();
            const amountUsd = Number(c?.amountUsd);
            const allocated = Math.round(amountUsd * 100);
            await client.query(
              `INSERT INTO spending_categories (
                 escrow_id,
                 category_name,
                 allocated_amount_usd_cents,
                 spent_amount_usd_cents,
                 remaining_amount_usd_cents
               ) VALUES ($1,$2,$3,0,$3)`,
              [escrowId, name, allocated],
            );
          }

          await client.query(
            `UPDATE escrow_funding_intents
             SET status = 'confirmed', webhook_payload = $1, confirmed_at = NOW(), escrow_id = $2, updated_at = NOW()
             WHERE intent_id = $3`,
            [payload, escrowId, intent.intent_id],
          );

          await client.query('COMMIT');
          return reply.code(200).send({ ok: true });
        }

        const onrampRes = await client.query(
          `SELECT * FROM onramp_transactions WHERE pretium_transaction_code = $1 FOR UPDATE`,
          [payload.transaction_code]
        );

        if (!onrampRes.rows.length) {
          throw new Error('Unknown transaction_code');
        }

        const onramp = onrampRes.rows[0];

        if (payload.status !== 'success') {
          await client.query(
            `UPDATE onramp_transactions SET status = 'failed', webhook_payload = $1, failed_at = NOW(), error_message = 'Pretium reported failure', updated_at = NOW() WHERE onramp_transaction_id = $2`,
            [payload, onramp.onramp_transaction_id]
          );

          await client.query('COMMIT');
          return reply.code(200).send({ ok: true });
        }

        const receivedUsdCents = Math.round(Number(payload.amount_usdc) * 100);

        if (receivedUsdCents < onramp.expected_usdc_cents) {
          throw new Error(
            `Underfunded escrow: expected=${onramp.expected_usdc_cents}, received=${receivedUsdCents}`
          );
        }

        await client.query(
          `UPDATE onramp_transactions SET status = 'confirmed', webhook_payload = $1, confirmed_at = NOW(), updated_at = NOW() WHERE onramp_transaction_id = $2`,
          [payload, onramp.onramp_transaction_id]
        );

        await client.query(
          `UPDATE escrows SET status = 'active', updated_at = NOW() WHERE escrow_id = $1 AND status = 'pending_deposit'`,
          [onramp.escrow_id]
        );

        await client.query('COMMIT');
        return reply.code(200).send({ ok: true });

      } catch (err: any) {
        await client.query('ROLLBACK');
        fastify.log.error(err);
        return reply.code(400).send({ error: err.message });
      } finally {
        client.release();
      }
    });
  });
}
