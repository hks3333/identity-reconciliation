import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { query } from './db.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/health', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT NOW()');
    res.status(200).json({
      message: 'ok',
      db_time: result.rows[0].now
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});