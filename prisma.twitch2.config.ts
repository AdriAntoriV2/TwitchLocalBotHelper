import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/twitch2/schema.prisma',
  migrations: {
    path: 'prisma/twitch2/migrations',
  },
  datasource: {
    url: 'file:./prisma/twitch2/twitch2.db',
  },
});
