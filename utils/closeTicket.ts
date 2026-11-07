import { db } from "../bot";
import type Bot from "../dependencies/yapper.js";
import { checkPermissions } from "./checkPermissions";

/**
 * Close a ticket
 * @param bot The bot object
 * @param serverId The server ID
 * @param ticketId The ticket ID
 * @param reason The reason for the ticket being closed (can be null)
 * @param channelDelete Whether this is triggered by channel deletion
 * @returns 
 */
export async function closeTicket(
    bot: Bot,
    serverId: string,
    ticketId: string,
    reason?: string,
    channelDelete?: boolean
) {
    const hasPermissions = await checkPermissions(
        bot,
        serverId,
        ["manage_channels", "manage_server"],
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

    const ticket: any = db.prepare(`
        SELECT *
        FROM tickets
        WHERE ticket_id = ?
        AND server_id = ?
    `).get(ticketId, serverId);

    if(!ticket)
        throw new Error('Ticket does not exist');

    if (channelDelete) {
        // Do not attempt to move the ticket to another category
        // & remove ticket from database
        db.prepare(`
            DELETE FROM tickets
            WHERE ticket_id = ?
            AND server_id = ?
        `).run(ticketId, serverId);
    } else {
        // Update the ticket in the database
        if(!server.closed_ticket_category)
            throw new Error('No closed ticket category is configured.');

        if(ticket.status === 'closed')
            throw new Error('Ticket is already closed');

        await bot.editChannel(ticket.channel_id, {
            categoryId: server.closed_ticket_category
        });

        db.prepare(`
            UPDATE tickets
            SET status = 'closed'
            WHERE ticket_id = ?
            AND server_id = ?
        `).run(ticketId, serverId);
    }

    // set user's active ticket to null if this ticket is selected (staff closing)
    db.prepare(`
        UPDATE users
        SET active_ticket = NULL
        WHERE user_id = ?
        AND active_ticket = ?
    `).run(ticket.opened_by, ticketId);

    const user: any = db.prepare(`
        SELECT active_ticket
        FROM users
        WHERE user_id = ?    
    `).get(ticket.opened_by);

    bot.dmSend(
        ticket.user_id,
        `Ticket \`${ticket.ticket_id} has been closed.\``
        + reason ? `\nReason: ${reason}` : ''
        + (!user.active_ticket ? '\n\nYou no longer have an active ticket - use `/switch` to switch to another & `/tickets` to view your tickets.' : '')
    );

    return {
        ticketId,
        closed: true,
        deleted: !!channelDelete
    }
}