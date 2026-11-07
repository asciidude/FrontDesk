import { randomBytes } from "node:crypto";
import { db } from "../bot";
import type Bot from "../dependencies/yapper.js";
import { checkPermissions } from "./checkPermissions";
import { Embed } from "../dependencies/yapper.js";

/**
 * Create a ticket
 * @param bot The bot object
 * @param serverId The server ID
 * @param userId The user ID
 * @param panelName The panel name
 * @returns 
 */
export async function createTicket(
    bot: Bot,
    userId: string,
    panel: any
) {
    const serverId = panel.server_id;

    const hasPermissions = await checkPermissions(
        bot,
        serverId,
        ["manage_channels", "manage_server", "mention_everyone"],
        {
            authorId: null,
            bot: true
        }
    );

    if (!hasPermissions)
        throw new Error("The bot is missing the required permissions.");

    const server: any = db.prepare(`
        SELECT *
        FROM servers
        WHERE server_id = ?
    `).get(serverId);

    if (!server)
        throw new Error('Server is not configured.');

    // Check if user exists. If not, create one
    db.prepare(`
        INSERT OR IGNORE INTO users (user_id)
        VALUES (?)
    `).run(userId);

    const user: any = db.prepare(`
        SELECT active_ticket
        FROM users
        WHERE user_id = ?
    `).get(userId);

    let channelId: string | undefined;
    const ticketId = randomBytes(6).toString('hex');
    const supportRoles: string[] = JSON.parse(server.support_roles);
    const adminRoles: string[] = JSON.parse(server.admin_roles);
    const channelName = `ticket-${ticketId}`;

    const botUser: any = await bot.api('GET', '/me');
    const botMember = await bot.member(serverId, botUser.id);

    try {
        const channel = await bot.createChannel(
            serverId,
            channelName,
            {
                kind: 'text',
                categoryId: server.open_ticket_category
            }
        );

        channelId = channel.id;

        await bot.editChannel(channel.id, {
            private: true,
            roleIds: [...new Set([...botMember.roles, ...supportRoles, ...adminRoles])]
        });

        db.prepare(`
            INSERT INTO tickets (
                ticket_id,
                channel_id,
                opened_by,
                status,
                server_id
            )
            VALUES (?, ?, ?, 'open', ?)
        `).run(ticketId, channel.id, userId, serverId);

        bot.send(
            channelId,
            supportRoles.map(roleId => `<@&${roleId}>`).join(' '),
            {
                embeds: [
                    new Embed({
                        title: panel.title,
                        description: `New ticket opened by <@${userId}>`,
                        color: panel.color
                    })
                ]
            }
        );

        if (!user.active_ticket) {
            db.prepare(`
                UPDATE users
                SET active_ticket = ?
                WHERE user_id = ?
                AND active_ticket IS NULL;
            `).run(ticketId, userId);

            console.log(`[DEBUG] Opened ticket ${ticketId} | User updated`)

            return {
                ticketId,
                updatedUser: true
            };
        }

        console.log(`[DEBUG] Opened ticket ${ticketId} | User NOT updated`)

        return {
            ticketId,
            updatedUser: false
        };
    } catch (e: any) {
        console.error(e);

        if (channelId) {
            try {
                await bot.deleteChannel(channelId);
            } catch (e: any) {
                console.error(e);
            }
        }

        return {
            ticketId: null,
            updatedUser: false
        };
    }
}