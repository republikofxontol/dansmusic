// EXPORT APLIKASI EXPRESS UNTUK VERCEL SERVERLESS FUNCTIONS
import server from '../dist/server.cjs';

const app = (server && (server as any).default) ? (server as any).default : server;

export default app;

