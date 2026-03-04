import express from 'express';
import { run, get, all } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { createUploadMiddleware, storeFile, deleteStoredFile, getFileBuffer } from '../utils/storage.js';

const upload = createUploadMiddleware('knowledge', {
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExts = ['.pdf', '.txt', '.md', '.json', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, TXT, MD, JSON, DOCX'));
    }
  }
});

// Extract text content from uploaded file buffer
async function extractFileContent(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md': {
      return buffer.toString('utf-8');
    }
    case '.json': {
      const raw = buffer.toString('utf-8');
      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }
    case '.pdf': {
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      return pdfData.text || '';
    }
    case '.docx': {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

const router = express.Router();

// GET /api/knowledge - List all knowledge base items (with search)
router.get('/', async (req, res) => {
  try {
    const { search, type } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = `
      SELECT kb.*, u.name as created_by_name
      FROM knowledge_base kb
      LEFT JOIN users u ON kb.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by type if specified
    if (type) {
      sql += ` AND kb.type = ?`;
      params.push(type);
    }

    // Search in title and content
    if (search && search.trim()) {
      sql += ` AND (kb.title LIKE ? OR kb.content LIKE ? OR kb.tags LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Show only current user's items
    sql += ` AND kb.created_by = ?`;
    params.push(userId);

    sql += ` ORDER BY kb.created_at DESC`;

    const rows = await all(sql, params);

    // Parse tags JSON for each row
    const items = rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));

    res.json({ items, count: items.length });
  } catch (error) {
    console.error('Error in knowledge GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge - Create new knowledge base item
router.post('/', async (req, res) => {
  try {
    const { type, title, content, tags } = req.body;
    const userId = req.user.id;

    // Validation
    if (!type) {
      return res.status(400).json({ error: 'Type is required' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const validTypes = ['case_study', 'faq', 'competitor_sheet', 'offer_template', 'document'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be one of: ' + validTypes.join(', ') });
    }

    const id = uuidv4();
    const tagsJson = tags && Array.isArray(tags) ? JSON.stringify(tags) : JSON.stringify([]);

    const sql = `
      INSERT INTO knowledge_base (id, type, title, content, tags, is_shared, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `;

    await run(sql, [id, type, title.trim(), content || '', tagsJson, userId]);

    // Fetch the created item
    const row = await get(
      `SELECT kb.*, u.name as created_by_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?`,
      [id]
    );

    res.status(201).json({
      item: {
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : []
      }
    });
  } catch (error) {
    console.error('Error in knowledge POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge/upload - Upload a document file and extract content
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    const { type = 'document', title, tags } = req.body;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;
    const ext = path.extname(originalName).toLowerCase().replace('.', '');
    const fileBuffer = getFileBuffer(req.file);

    // Validate type
    const validTypes = ['case_study', 'faq', 'competitor_sheet', 'offer_template', 'document'];
    const finalType = validTypes.includes(type) ? type : 'document';

    // Extract text content from the file buffer
    let content = '';
    let extractionError = null;
    try {
      content = await extractFileContent(fileBuffer, originalName);
    } catch (err) {
      console.error('Error extracting file content:', err);
      extractionError = err.message;
      content = `[Content extraction failed for ${originalName}]`;
    }

    const finalTitle = (title && title.trim()) || originalName.replace(/\.[^/.]+$/, '');

    // Parse tags
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }
    // Add file format as tag
    parsedTags.push(ext.toUpperCase());
    const tagsJson = JSON.stringify(parsedTags);

    const id = uuidv4();
    const { url: fileUrl, storagePath } = await storeFile(req.file, 'knowledge');

    const sql = `
      INSERT INTO knowledge_base (id, type, title, content, file_url, tags, is_shared, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `;

    try {
      await run(sql, [id, finalType, finalTitle, content, fileUrl, tagsJson, userId]);
    } catch (dbErr) {
      console.error('Error saving uploaded document:', dbErr);
      // Clean up file on error
      await deleteStoredFile(storagePath);
      return res.status(500).json({ error: 'Failed to save document' });
    }

    // Fetch the created item
    const row = await get(
      `SELECT kb.*, u.name as created_by_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?`,
      [id]
    );

    const item = {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    };

    res.status(201).json({
      item,
      extraction: {
        success: !extractionError,
        error: extractionError,
        contentLength: content.length,
        fileSize,
        format: ext
      }
    });
  } catch (error) {
    console.error('Error in knowledge upload:', error);
    // Clean up file on error (disk mode only)
    if (req.file?.path) {
      await deleteStoredFile(req.file.path);
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/knowledge/search - Search knowledge base
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    if (!q || !q.trim()) {
      return res.json({ items: [], count: 0 });
    }

    const searchTerm = `%${q.trim()}%`;

    const sql = `
      SELECT kb.*, u.name as created_by_name
      FROM knowledge_base kb
      LEFT JOIN users u ON kb.created_by = u.id
      WHERE (kb.title LIKE ? OR kb.content LIKE ? OR kb.tags LIKE ?)
        AND kb.created_by = ?
      ORDER BY
        CASE
          WHEN kb.title LIKE ? THEN 1
          WHEN kb.content LIKE ? THEN 2
          ELSE 3
        END,
        kb.created_at DESC
    `;

    const rows = await all(sql, [searchTerm, searchTerm, searchTerm, userId, searchTerm, searchTerm]);

    const items = rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));

    res.json({ items, count: items.length });
  } catch (error) {
    console.error('Error in knowledge search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge/:id - Get single item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const row = await get(
      `SELECT kb.*, u.name as created_by_name
       FROM knowledge_base kb
       LEFT JOIN users u ON kb.created_by = u.id
       WHERE kb.id = ? AND kb.created_by = ?`,
      [id, userId]
    );

    if (!row) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({
      item: {
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : []
      }
    });
  } catch (error) {
    console.error('Error in knowledge GET/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/knowledge/:id - Update item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags, is_shared } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if item exists and user can edit
    const item = await get('SELECT * FROM knowledge_base WHERE id = ?', [id]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Only creator or admin can edit
    if (item.created_by !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own items' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags || []));
    }

    if (is_shared !== undefined) {
      updates.push('is_shared = ?');
      params.push(is_shared ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    const sql = `UPDATE knowledge_base SET ${updates.join(', ')} WHERE id = ?`;

    await run(sql, params);

    // Fetch updated item
    const row = await get(
      `SELECT kb.*, u.name as created_by_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?`,
      [id]
    );

    res.json({
      item: {
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : []
      }
    });
  } catch (error) {
    console.error('Error in knowledge PUT:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/knowledge/:id - Delete item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if item exists and user can delete
    const item = await get('SELECT * FROM knowledge_base WHERE id = ?', [id]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Only creator or admin can delete
    if (item.created_by !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own items' });
    }

    await run('DELETE FROM knowledge_base WHERE id = ?', [id]);

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error in knowledge DELETE:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
