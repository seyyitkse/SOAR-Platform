import { WebClient, KnownBlock, Block } from '@slack/web-api';
import axios from 'axios';
import { NotificationJobData } from '../types';
import logger from '../utils/logger';

let slackClient: WebClient | null = null;

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL);
}

function getSlackClient(): WebClient | null {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!slackClient) {
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return slackClient;
}

function buildSlackBlocks(data: NotificationJobData): (KnownBlock | Block)[] {
  const severityEmoji = data.eventSeverity >= 8 ? '🔴' : data.eventSeverity >= 5 ? '🟡' : '🔵';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const fields: { type: 'mrkdwn'; text: string }[] = [
    { type: 'mrkdwn', text: `*Tetikleyen Kural:*\n${data.ruleName}` },
    { type: 'mrkdwn', text: `*Olay:*\n${data.eventTitle}` },
    { type: 'mrkdwn', text: `*Tip:*\n${data.eventType}` },
    { type: 'mrkdwn', text: `*Entegrasyon:*\n${data.integrationName}` },
  ];

  if (data.sourceIp) {
    fields.push({ type: 'mrkdwn', text: `*Kaynak IP:*\n\`${data.sourceIp}\`` });
  }
  if (data.destIp) {
    fields.push({ type: 'mrkdwn', text: `*Hedef IP:*\n\`${data.destIp}\`` });
  }

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${severityEmoji} SOAR Alert — Severity ${data.eventSeverity}/10`,
      },
    },
    {
      type: 'section',
      fields,
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `SOAR Platform | <${frontendUrl}/analyst|Analiste Git> | ${new Date(data.time).toISOString()}`,
        },
      ],
    },
  ];
}

async function sendViaWebhook(data: NotificationJobData): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL!;
  await axios.post(webhookUrl, { blocks: buildSlackBlocks(data) }, { timeout: 10000 });
}

async function sendViaBotToken(target: string, data: NotificationJobData): Promise<void> {
  const client = getSlackClient()!;
  let channelId = target;

  // @kullanıcı için DM kanalı aç
  if (target.startsWith('@')) {
    const username = target.slice(1);
    const usersResponse = await client.users.list({});
    const user = usersResponse.members?.find(
      (m) => m.name === username || m.profile?.display_name === username,
    );

    if (!user?.id) {
      logger.warn('[SlackService] Kullanıcı bulunamadı', { username });
      return;
    }

    const dmResponse = await client.conversations.open({ users: user.id });
    channelId = dmResponse.channel?.id ?? target;
  }

  await client.chat.postMessage({
    channel: channelId,
    blocks: buildSlackBlocks(data),
    text: `SOAR Alert — Severity ${data.eventSeverity}/10 — ${data.eventTitle}`,
  });
}

export async function sendSlackNotification(target: string, data: NotificationJobData): Promise<void> {
  if (!isSlackConfigured()) {
    logger.warn('[SlackService] Slack yapılandırılmamış, bildirim atlanıyor', { target });
    return;
  }

  const client = getSlackClient();

  if (client) {
    // Bot token var — hem #kanal hem @kullanıcı desteklenir
    await sendViaBotToken(target, data);
    logger.info('[SlackService] Slack mesajı gönderildi (bot token)', { target });
  } else if (process.env.SLACK_WEBHOOK_URL) {
    // Yalnızca webhook — @kullanıcı desteklenmez
    if (target.startsWith('@')) {
      logger.warn('[SlackService] Webhook ile @kullanıcı hedefi desteklenmiyor', { target });
      return;
    }
    await sendViaWebhook(data);
    logger.info('[SlackService] Slack mesajı gönderildi (webhook)', { target });
  }
}
