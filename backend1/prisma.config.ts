import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Use DATABASE_URL if provided, otherwise fall back to local SQLite file
    url: 'file:./prisma/dev.db',
  },
});

