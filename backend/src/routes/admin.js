import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/admin/audit-log - Get audit log entries
router.get('/audit-log', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { limit = 100, offset = 0, userId, action, entityType } = req.query;

    let query = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND al.user_id = ?';
      params.push(userId);
    }

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    if (entityType) {
      query += ' AND al.entity_type = ?';
      params.push(entityType);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await all(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM audit_log WHERE 1=1';
    const countParams = [];
    if (userId) {
      countQuery += ' AND user_id = ?';
      countParams.push(userId);
    }
    if (action) {
      countQuery += ' AND action = ?';
      countParams.push(action);
    }
    if (entityType) {
      countQuery += ' AND entity_type = ?';
      countParams.push(entityType);
    }

    const { total } = await get(countQuery, countParams);

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        userId: log.user_id,
        userName: log.user_name,
        userEmail: log.user_email,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id,
        details: log.details ? JSON.parse(log.details) : null,
        ipAddress: log.ip_address,
        createdAt: log.created_at
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// GET /api/admin/system-health - Get system health metrics
router.get('/system-health', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Get counts for various entities
    const [
      userCount,
      dealCount,
      leadCount,
      transcriptCount,
      salesRoomCount,
      sessionCount,
      auditLogCount
    ] = await Promise.all([
      get('SELECT COUNT(*) as count FROM users'),
      get('SELECT COUNT(*) as count FROM deals'),
      get('SELECT COUNT(*) as count FROM leads'),
      get('SELECT COUNT(*) as count FROM transcripts'),
      get('SELECT COUNT(*) as count FROM sales_rooms'),
      get('SELECT COUNT(*) as count FROM sessions WHERE expires_at > datetime("now")'),
      get('SELECT COUNT(*) as count FROM audit_log')
    ]);

    // Get database size (approximate)
    const dbStats = await get('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      counts: {
        users: userCount.count,
        deals: dealCount.count,
        leads: leadCount.count,
        transcripts: transcriptCount.count,
        salesRooms: salesRoomCount.count,
        activeSessions: sessionCount.count,
        auditLogEntries: auditLogCount.count
      },
      database: {
        sizeBytes: dbStats?.size || 0,
        sizeMB: dbStats ? (dbStats.size / (1024 * 1024)).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Get system health error:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
});

// POST /api/admin/export-data - Export all system data
router.post('/export-data', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Get all data from all tables (excluding sensitive data like passwords)
    const [users, deals, leads, transcripts, salesRooms, activities, battlecards, knowledge] = await Promise.all([
      all('SELECT id, email, name, role, is_active, created_at, updated_at FROM users'),
      all('SELECT * FROM deals'),
      all('SELECT * FROM leads'),
      all('SELECT id, deal_id, file_name, file_format, source_platform, processed, uploaded_by, created_at, processed_at FROM transcripts'),
      all('SELECT id, deal_id, template_type, public_url_slug, chatbot_enabled, is_expired, created_at FROM sales_rooms'),
      all('SELECT * FROM activities'),
      all('SELECT * FROM battlecards'),
      all('SELECT * FROM knowledge_base')
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      data: {
        users,
        deals,
        leads,
        transcripts,
        salesRooms,
        activities,
        battlecards,
        knowledge
      }
    };

    // Log the export action
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'data_export', 'system', JSON.stringify({ tables: Object.keys(exportData.data) }), req.ip]
    );

    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// POST /api/admin/gdpr-delete - GDPR hard delete with password re-authentication
router.post('/gdpr-delete', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { userId, password } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Admin password is required for GDPR deletion' });
    }

    // Verify admin's password for re-authentication
    const admin = await get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!admin) {
      return res.status(401).json({ error: 'Admin user not found' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    if (!isValidPassword) {
      // Log failed attempt
      await run(
        'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), req.user.id, 'gdpr_delete_failed', 'user', userId, JSON.stringify({ reason: 'Invalid password' }), req.ip]
      );
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Prevent self-deletion
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user to be deleted
    const userToDelete = await get('SELECT id, email, name FROM users WHERE id = ?', [userId]);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Begin cascading hard delete (GDPR compliance - remove all PII)
    const deletedCounts = {
      sessions: 0,
      passwordResetTokens: 0,
      notifications: 0,
      activities: 0,
      chatbotLogs: 0,
      salesRoomAnalytics: 0,
      salesRooms: 0,
      transcripts: 0,
      battlecards: 0,
      knowledgeBase: 0,
      leads: 0,
      deals: 0,
      intentSearches: 0,
      icpTemplates: 0
    };

    // Delete in correct order to respect foreign key constraints
    // First delete sessions
    const sessionResult = await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    deletedCounts.sessions = sessionResult.changes;

    // Delete password reset tokens
    const tokenResult = await run('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
    deletedCounts.passwordResetTokens = tokenResult.changes;

    // Delete notifications
    const notifResult = await run('DELETE FROM notifications WHERE user_id = ?', [userId]);
    deletedCounts.notifications = notifResult.changes;

    // Get user's deals to cascade delete related data
    const userDeals = await all('SELECT id FROM deals WHERE owner_id = ?', [userId]);
    const dealIds = userDeals.map(d => d.id);

    if (dealIds.length > 0) {
      const placeholders = dealIds.map(() => '?').join(',');

      // Delete activities for user's deals
      const activityResult = await run(`DELETE FROM activities WHERE deal_id IN (${placeholders})`, dealIds);
      deletedCounts.activities = activityResult.changes;

      // Get sales rooms for user's deals
      const salesRooms = await all(`SELECT id FROM sales_rooms WHERE deal_id IN (${placeholders})`, dealIds);
      const salesRoomIds = salesRooms.map(sr => sr.id);

      if (salesRoomIds.length > 0) {
        const srPlaceholders = salesRoomIds.map(() => '?').join(',');

        // Delete chatbot logs
        const chatResult = await run(`DELETE FROM chatbot_logs WHERE sales_room_id IN (${srPlaceholders})`, salesRoomIds);
        deletedCounts.chatbotLogs = chatResult.changes;

        // Delete sales room analytics
        const analyticsResult = await run(`DELETE FROM sales_room_analytics WHERE sales_room_id IN (${srPlaceholders})`, salesRoomIds);
        deletedCounts.salesRoomAnalytics = analyticsResult.changes;
      }

      // Delete sales rooms
      const srResult = await run(`DELETE FROM sales_rooms WHERE deal_id IN (${placeholders})`, dealIds);
      deletedCounts.salesRooms = srResult.changes;

      // Delete transcripts
      const transcriptResult = await run(`DELETE FROM transcripts WHERE deal_id IN (${placeholders})`, dealIds);
      deletedCounts.transcripts = transcriptResult.changes;
    }

    // Delete battlecards created by user
    const battleResult = await run('DELETE FROM battlecards WHERE created_by = ?', [userId]);
    deletedCounts.battlecards = battleResult.changes;

    // Delete knowledge base items created by user
    const kbResult = await run('DELETE FROM knowledge_base WHERE created_by = ?', [userId]);
    deletedCounts.knowledgeBase = kbResult.changes;

    // Delete leads owned by user
    const leadResult = await run('DELETE FROM leads WHERE owner_id = ?', [userId]);
    deletedCounts.leads = leadResult.changes;

    // Delete deals
    const dealResult = await run('DELETE FROM deals WHERE owner_id = ?', [userId]);
    deletedCounts.deals = dealResult.changes;

    // Delete intent searches
    const searchResult = await run('DELETE FROM intent_searches WHERE owner_id = ?', [userId]);
    deletedCounts.intentSearches = searchResult.changes;

    // Delete ICP templates
    const icpResult = await run('DELETE FROM icp_templates WHERE owner_id = ?', [userId]);
    deletedCounts.icpTemplates = icpResult.changes;

    // Delete deal notes created by user
    await run('DELETE FROM deal_notes WHERE created_by = ?', [userId]);

    // Delete activities created by user (not just activities on their deals)
    await run('DELETE FROM activities WHERE created_by = ?', [userId]);

    // Delete battlecard feedback by user
    await run('DELETE FROM battlecard_feedback WHERE user_id = ?', [userId]);

    // Set audit_log user_id to NULL for records by this user (keep for compliance)
    await run('UPDATE audit_log SET user_id = NULL WHERE user_id = ?', [userId]);

    // Finally delete the user
    await run('DELETE FROM users WHERE id = ?', [userId]);

    // Log the GDPR deletion (with limited info for compliance)
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        req.user.id,
        'gdpr_hard_delete',
        'user',
        userId,
        JSON.stringify({
          deletedUserEmail: userToDelete.email,
          deletedCounts,
          timestamp: new Date().toISOString()
        }),
        req.ip
      ]
    );

    res.json({
      message: 'User and all associated data have been permanently deleted (GDPR compliance)',
      deletedUser: {
        id: userId,
        email: userToDelete.email,
        name: userToDelete.name
      },
      deletedCounts
    });
  } catch (error) {
    console.error('GDPR delete error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to perform GDPR deletion', details: error.message });
  }
});

// GET /api/admin/gdpr-preview/:userId - Preview what will be deleted for GDPR
router.get('/gdpr-preview/:userId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await get('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get counts of all associated data
    const [
      dealsCount,
      leadsCount,
      transcriptsCount,
      salesRoomsCount,
      battlecardsCount,
      knowledgeCount,
      activitiesCount,
      searchesCount
    ] = await Promise.all([
      get('SELECT COUNT(*) as count FROM deals WHERE owner_id = ?', [userId]),
      get('SELECT COUNT(*) as count FROM leads WHERE owner_id = ?', [userId]),
      get('SELECT COUNT(*) as count FROM transcripts t INNER JOIN deals d ON t.deal_id = d.id WHERE d.owner_id = ?', [userId]),
      get('SELECT COUNT(*) as count FROM sales_rooms sr INNER JOIN deals d ON sr.deal_id = d.id WHERE d.owner_id = ?', [userId]),
      get('SELECT COUNT(*) as count FROM battlecards WHERE created_by = ?', [userId]),
      get('SELECT COUNT(*) as count FROM knowledge_base WHERE created_by = ?', [userId]),
      get('SELECT COUNT(*) as count FROM activities a INNER JOIN deals d ON a.deal_id = d.id WHERE d.owner_id = ?', [userId]),
      get('SELECT COUNT(*) as count FROM intent_searches WHERE owner_id = ?', [userId])
    ]);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.created_at
      },
      dataToDelete: {
        deals: dealsCount.count,
        leads: leadsCount.count,
        transcripts: transcriptsCount.count,
        salesRooms: salesRoomsCount.count,
        battlecards: battlecardsCount.count,
        knowledgeBase: knowledgeCount.count,
        activities: activitiesCount.count,
        intentSearches: searchesCount.count
      },
      warning: 'This action is irreversible. All data will be permanently deleted to comply with GDPR.'
    });
  } catch (error) {
    console.error('GDPR preview error:', error);
    res.status(500).json({ error: 'Failed to preview GDPR deletion' });
  }
});

// GET /api/admin/settings - Get all system settings
router.get('/settings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const settings = await all('SELECT key, value, updated_at FROM system_settings');

    // Convert to object format
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = {
        value: s.value,
        updatedAt: s.updated_at
      };
    });

    res.json({ settings: settingsObj });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/admin/settings - Update system settings
router.put('/settings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    // Validate known settings
    const validKeys = [
      'session_timeout_hours',
      'max_file_size_mb',
      'stagnation_warning_days',
      'stagnation_critical_days',
      'auto_archive_months',
      'slack_webhook_url',
      'slack_notifications_enabled',
      'email_notifications_enabled',
      'default_deal_health_threshold'
    ];

    const updatedSettings = [];

    for (const [key, value] of Object.entries(settings)) {
      if (!validKeys.includes(key)) {
        continue; // Skip unknown keys
      }

      // Upsert the setting
      await run(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, String(value)]
      );
      updatedSettings.push(key);
    }

    // Log the settings change
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'settings_updated', 'system', JSON.stringify({ updatedKeys: updatedSettings }), req.ip]
    );

    // Get updated settings
    const allSettings = await all('SELECT key, value, updated_at FROM system_settings');
    const settingsObj = {};
    allSettings.forEach(s => {
      settingsObj[s.key] = {
        value: s.value,
        updatedAt: s.updated_at
      };
    });

    res.json({
      message: 'Settings updated successfully',
      settings: settingsObj
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /api/admin/settings/test-slack - Test Slack webhook
router.post('/settings/test-slack', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const slackSetting = await get('SELECT value FROM system_settings WHERE key = ?', ['slack_webhook_url']);

    if (!slackSetting || !slackSetting.value) {
      return res.status(400).json({ error: 'Slack webhook URL is not configured' });
    }

    const webhookUrl = slackSetting.value;

    // Send test message to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🔔 Test notification from Proces OS Sales Room',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Test Notification*\nThis is a test message from Proces OS Sales Room. If you see this, your Slack integration is working correctly!'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Sent by: ${req.user.name} (${req.user.email}) at ${new Date().toISOString()}`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack API error: ${errorText}`);
    }

    // Log the test
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'slack_test', 'system', JSON.stringify({ success: true }), req.ip]
    );

    res.json({ message: 'Test notification sent successfully to Slack' });
  } catch (error) {
    console.error('Slack test error:', error);
    res.status(500).json({ error: 'Failed to send test notification: ' + error.message });
  }
});

export default router;
