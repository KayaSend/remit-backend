import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { updateUserWallet, getUserWallet } from '../services/database.js';

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface WalletSyncBody {
  walletAddress: string;
  chainType?: string;
}

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Sync wallet address from frontend after Privy embedded wallet creation
  fastify.post<{ Body: WalletSyncBody }>(
    '/sync',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { walletAddress, chainType = 'evm' } = request.body;

      if (!walletAddress || !EVM_ADDRESS_REGEX.test(walletAddress)) {
        return reply.code(400).send({ error: 'Invalid EVM wallet address' });
      }

      const userId = request.user!.userId;
      const normalized = walletAddress.toLowerCase();

      await updateUserWallet(userId, normalized, chainType);

      return reply.code(200).send({
        success: true,
        walletAddress: normalized,
        chainType,
      });
    }
  );

  // Get current user's wallet info
  fastify.get(
    '/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.userId;
      const wallet = await getUserWallet(userId);

      if (!wallet) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.code(200).send({
        walletAddress: wallet.walletAddress,
        chainType: wallet.chainType,
        configuredAt: wallet.configuredAt,
      });
    }
  );
};
