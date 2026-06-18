// Public read of the video/podcast library, grouped by service category.
import { Router } from 'express';
import { groupedVideos } from '../services/youtube.js';

const router = Router();

router.get('/api/videos', (req, res) => {
  res.json(groupedVideos());
});

export default router;
