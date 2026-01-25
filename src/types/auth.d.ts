import 'fastify';

declare module 'fastify' {
  interface AuthenticatedUser {
    userId: string;
    phone?: string;
    name?: string;
    // add other fields you need later
  }

  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
