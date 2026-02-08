import { FastifyInstance } from 'fastify';
import { pool } from '../services/database.js';
import { initiateKesOnRamp, getExchangeRate } from '../services/pretium.js';
import { authMiddleware } from '../middleware/auth.js';
import { hashForLookup } from '../utils/crypto.js';


const SETTLEMENT_WALLET = process.env.BACKEND_SETTLEMENT_WALLET!;

// IMPORTANT: This endpoint only initiates onramp.
// It must NEVER finalize transaction or escrow state.
// Webhooks are authoritative.


export async function onrampRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // New flow: initiate onramp WITHOUT creating an escrow first.
  // Client sends the escrow payload + sender phone; we create a funding intent
  // and initiate the Pretium onramp. Webhook confirmation creates the escrow.
  // ---------------------------------------------------------------------------
  fastify.post('/kes/intent', { preHandler: authMiddleware }, async (req, reply) => {
    const {
      phone_number,
      recipient_phone,
      total_amount_usd,
      categories,
      memo,
    } = req.body as any;
    const userId = req.user!.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!/^0\d{9}$/.test(phone_number)) {
      return reply.code(400).send({ error: 'Invalid phone number format' });
    }

    if (typeof recipient_phone !== 'string' || !recipient_phone.startsWith('+254')) {
      return reply.code(400).send({ error: 'Invalid recipient phone format' });
    }

    // Ensure recipient exists and belongs to sender (prevents webhook-time failure)
    const recipientHash = hashForLookup(recipient_phone);
    const recipientCheck = await pool.query(
      `SELECT recipient_id
       FROM recipients
       WHERE created_by_user_id = $1 AND phone_number_hash = $2
       LIMIT 1`,
      [userId, recipientHash],
    );
    if (!recipientCheck.rows.length) {
      return reply.code(400).send({ error: 'Recipient not found' });
    }

    const totalUsd = Number(total_amount_usd);
    if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
      return reply.code(400).send({ error: 'Invalid total_amount_usd' });
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      return reply.code(400).send({ error: 'categories are required' });
    }

    // Validate categories
    const allowed = new Set(['electricity', 'water', 'rent', 'food', 'medical', 'education', 'other']);
    for (const c of categories) {
      const name = String(c?.name ?? '').toLowerCase();
      const amount = Number(c?.amountUsd);
      if (!allowed.has(name)) {
        return reply.code(400).send({ error: `Invalid category: ${name}` });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.code(400).send({ error: `Invalid category amount for ${name}` });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const totalUsdCents = Math.round(totalUsd * 100);

      const rate = await getExchangeRate();
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Invalid exchange rate');
      }

      const amountKes = Math.ceil((totalUsdCents / 100) * rate);
      if (!Number.isFinite(amountKes) || amountKes <= 0) {
        throw new Error('Invalid KES amount');
      }

      const pretium = await initiateKesOnRamp({
        phone: phone_number,
        amountKes,
      });

      // Store intent payload for webhook → escrow creation
      const intentRes = await client.query(
        `INSERT INTO escrow_funding_intents (
          sender_user_id,
          recipient_phone,
          total_amount_usd_cents,
          categories,
          memo,
          phone_number,
          exchange_rate,
          amount_kes_cents,
          expected_usdc_cents,
          settlement_address,
          pretium_transaction_code,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
        RETURNING intent_id`,
        [
          userId,
          recipient_phone,
          totalUsdCents,
          JSON.stringify(categories),
          memo ?? null,
          phone_number,
          rate,
          amountKes * 100,
          totalUsdCents,
          SETTLEMENT_WALLET,
          pretium.transaction_code,
        ],
      );

      await client.query('COMMIT');
      return reply.send({
        message: 'M-Pesa prompt sent',
        transaction_code: pretium.transaction_code,
        intent_id: intentRes.rows[0].intent_id,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // Read-only status lookup so frontend can poll by transaction_code
  fastify.get('/kes/status/:transactionCode', { preHandler: authMiddleware }, async (req, reply) => {
    const { transactionCode } = req.params as any;
    const userId = req.user!.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { rows } = await pool.query(
      `SELECT intent_id, status, escrow_id
       FROM escrow_funding_intents
       WHERE pretium_transaction_code = $1 AND sender_user_id = $2
       LIMIT 1`,
      [transactionCode, userId],
    );

    if (!rows.length) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    return reply.send({
      success: true,
      intentId: rows[0].intent_id,
      status: rows[0].status,
      escrowId: rows[0].escrow_id,
    });
  });

  fastify.post('/kes',{ preHandler: authMiddleware }, async (req, reply) => {
    const { phone_number, escrow_id } = req.body as any;
    const userId = req.user!.userId;


    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!/^0\d{9}$/.test(phone_number)) {
      return reply.code(400).send({ error: 'Invalid phone number format' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const escrowRes = await client.query(
        `SELECT total_amount_usd_cents, status
         FROM escrows
         WHERE escrow_id = $1 AND sender_user_id = $2
         FOR UPDATE`,
        [escrow_id, userId]
      );

      if (!escrowRes.rows.length) {
        throw new Error('Escrow not found');
      }

      const escrow = escrowRes.rows[0];

      if (escrow.status !== 'pending_deposit') {
        throw new Error('Escrow not ready');
      }

      const totalUsdCents = Number(escrow.total_amount_usd_cents);
      if (!Number.isFinite(totalUsdCents) || totalUsdCents <= 0) {
        throw new Error('Invalid escrow USD amount');
      }

      const usd = totalUsdCents / 100;

      const rate = await getExchangeRate();
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Invalid exchange rate');
      }

      const amountKes = Math.ceil(usd * rate);
      if (!Number.isFinite(amountKes) || amountKes <= 0) {
        throw new Error('Invalid KES amount');
      }

      const pretium = await initiateKesOnRamp({
        phone: phone_number,
        amountKes,
      });

      // ✅ FIXED INSERT
      await client.query(
        `INSERT INTO onramp_transactions (
          escrow_id,
          sender_user_id,
          pretium_transaction_code,
          phone_number,
          amount_kes_cents,
          expected_usdc_cents,
          exchange_rate,
          settlement_address,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [
          escrow_id,
          userId,
          pretium.transaction_code,
          phone_number,
          amountKes * 100,
          totalUsdCents,
          rate,
          SETTLEMENT_WALLET,
        ]
      );

      await client.query('COMMIT');

      return {
        message: 'M-Pesa prompt sent',
        transaction_code: pretium.transaction_code,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: err.message });
    } finally {
      client.release();
    }
  });
}
