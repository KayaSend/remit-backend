import { FastifyInstance } from 'fastify';
import { getDailySpendStatus } from '../services/dailySpendService.js';
import { findRecipientByPhone, getRecipientDashboard } from '../services/database.js';
import { authMiddleware } from '../middleware/auth.js';

export async function recipientRoutes(fastify: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /recipients/me/dashboard
  // ─────────────────────────────────────────────────────────────────────────
  // Returns aggregated dashboard data for the authenticated recipient.
  // Phase 1: Uses mock phone from auth context.
  // Phase 2: Will derive phone from JWT claims.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/me/dashboard',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        // Phase 1: Get recipient phone from request context
        // In Phase 2, this will come from JWT claims
        const recipientPhone = (request as any).recipientPhone || '+254700000000';

        // Find recipient by phone
        const recipient = await findRecipientByPhone(recipientPhone);

        if (!recipient) {
          return reply.code(404).send({
            error: 'Recipient not found',
            message: 'No recipient account found for this phone number. Please contact the sender.'
          });
        }

        // Get full dashboard data
        const dashboard = await getRecipientDashboard(recipient.recipientId);

        return {
          success: true,
          data: dashboard
        };

      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /recipients/:id/daily-spend (legacy endpoint)
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/daily-spend',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const status = await getDailySpendStatus(id);

        return {
          dailyLimitUsd: status.dailyLimitCents / 100,
          spentTodayUsd: status.spentTodayCents / 100,
          remainingTodayUsd: status.remainingTodayCents / 100,
          transactionCount: status.transactionCount,
          lastTransactionAt: status.lastTransactionAt
        };

      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );
}