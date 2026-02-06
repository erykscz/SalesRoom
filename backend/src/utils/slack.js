import { get } from '../db/database.js';

/**
 * Check if Slack notifications are enabled and webhook URL is configured
 */
async function getSlackConfig() {
  const slackEnabled = await get('SELECT value FROM system_settings WHERE key = ?', ['slack_notifications_enabled']);
  if (!slackEnabled || slackEnabled.value !== 'true') {
    return null;
  }

  const slackWebhook = await get('SELECT value FROM system_settings WHERE key = ?', ['slack_webhook_url']);
  if (!slackWebhook || !slackWebhook.value) {
    return null;
  }

  return { webhookUrl: slackWebhook.value };
}

/**
 * Send a notification to Slack when a client opens a Sales Room
 */
export async function sendSalesRoomViewNotification(salesRoom, visitorRole) {
  try {
    const config = await getSlackConfig();
    if (!config) {
      console.log('Slack notifications not enabled or webhook not configured, skipping Sales Room view notification');
      return;
    }

    const companyName = salesRoom.deal_company || 'Unknown Company';
    const roomName = salesRoom.name || 'Unnamed Room';
    const roleInfo = visitorRole ? `*Visitor Role:* ${visitorRole}` : '*Visitor Role:* Not specified';
    const timestamp = new Date().toLocaleString();

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '👀 Sales Room Viewed',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Company:*\n${companyName}`
              },
              {
                type: 'mrkdwn',
                text: `*Room:*\n${roomName}`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: roleInfo
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${timestamp}`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🔗 Sales Room URL: */room/${salesRoom.public_url_slug}*`
              }
            ]
          }
        ]
      })
    });

    if (response.ok) {
      console.log(`Slack notification sent for Sales Room view: ${salesRoom.public_url_slug}`);
    } else {
      const errorText = await response.text();
      console.error('Slack notification failed:', errorText);
    }
  } catch (error) {
    console.error('Error sending Slack notification for Sales Room view:', error);
    // Don't throw - Slack notification failure shouldn't affect the Sales Room viewing
  }
}

/**
 * Send a notification to Slack when a client views a specific section
 */
export async function sendSectionViewNotification(salesRoom, section, visitorRole) {
  try {
    const config = await getSlackConfig();
    if (!config) {
      return;
    }

    const companyName = salesRoom.deal_company || 'Unknown Company';
    const sectionEmoji = {
      'overview': '📋',
      'cfo': '💰',
      'cto': '🔧',
      'security': '🔒',
      'engineering': '⚙️',
      'map': '✅',
      'poll': '📊',
      'chatbot': '💬'
    };

    const emoji = sectionEmoji[section] || '📌';
    const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
    const roleInfo = visitorRole ? `(${visitorRole})` : '';

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *${companyName}* ${roleInfo} is viewing the *${sectionName}* section`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Sales Room: ${salesRoom.name || salesRoom.public_url_slug}`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Slack section notification failed:', errorText);
    }
  } catch (error) {
    console.error('Error sending Slack section notification:', error);
  }
}

export default {
  sendSalesRoomViewNotification,
  sendSectionViewNotification
};
