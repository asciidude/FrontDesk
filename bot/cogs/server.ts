import { db, messageSwitchboard } from "..";
import { Button, Cog, Embed, Row } from "../../dependencies/yapper";
import { checkPanelParts } from "../../utils/checkPanelParts";
import { isAdminOrSupport } from "../../utils/isAdminOrSupport";
import { MessageCollector } from "../../utils/MessageCollector";

export class Server extends Cog {
    private activePanelSessions = new Set<string>();

    commands = {
        addpanel: {
            description: "Add a panel. Server admins only.",
            serverOnly: true,
            class: 'server',
            run: async (msg: any) => {
                // check user perms for admin OR if they have admin role
                const {
                    author_id: userId,
                    server_id: serverId
                } = msg;

                if (this.activePanelSessions.has(userId)) {
                    msg.reply('You already have an active panel session.');
                    return;
                }

                const user = await this.bot.member(serverId, userId);

                const {
                    error: serverNotFound, isAdmin
                } = await isAdminOrSupport(user, serverId, false);

                if (serverNotFound) {
                    msg.reply(serverNotFound);
                    return;
                }

                if (!isAdmin) {
                    msg.reply('You must have the admin role in order to add a panel.');
                    return;
                }

                msg.reply(
                    'To add a panel, provide the following (seperate each item by a new line | ⭐ = required):'
                    + '\`\`\`\n#channel'
                    + '\nTitle (⭐)'
                    + '\nDescription (⭐)'
                    + '\nColor (HEX)'
                    + '\nThumbnail\`\`\`'
                    + '\n-# To cancel creation, type "cancel".'
                );

                new MessageCollector(
                    messageSwitchboard,
                    ((m: any) => m.author_id === userId),
                    {
                        duration: 300000,
                        maxResponses: 1
                    },
                    async (m: any) => {
                        try {
                            this.activePanelSessions.add(userId);

                            const content = m[0].content;

                            if (content.toLowerCase() === 'cancel') {
                                msg.reply('Panel creation cancelled.');
                                return;
                            }

                            const index = content.indexOf('\n');

                            if (index === -1) {
                                msg.reply('Invalid format. Try again.');
                                return;
                            }

                            const channel = (content.slice(0, index)).trim();
                            const parts = (content.slice(index + 1)).split('\n');

                            if (!channel || !(/^<#([0-9a-fA-F-]{36})>$/.test(channel))) {
                                msg.reply('You must provide a valid channel.');
                                return;
                            }

                            const {
                                name, description, color, thumbnail,
                                errors
                            } = await checkPanelParts(parts);

                            if (errors.length === 0) {
                                let messageEmbed;
                                const channelId = channel.slice(2, -1);

                                try {
                                    const embed = new Embed({
                                        title: name,
                                        description,
                                        color: color,
                                        image: thumbnail,
                                        timestamp: new Date()
                                    });

                                    messageEmbed = await this.bot.send(channelId, '', { embeds: [embed] });

                                    const result: any = db.prepare(`
                                        INSERT INTO ticket_panels (
                                            server_id,
                                            channel_id,
                                            message_id,
                                            title,
                                            description,
                                            color,
                                            thumbnail_url
                                        )
                                        VALUES(?, ?, ?, ?, ?, ?, ?)
                                    `).run(
                                        serverId,
                                        channelId,
                                        messageEmbed.id,
                                        name,
                                        description,
                                        color,
                                        thumbnail
                                    );

                                    await this.bot.api(
                                        'PATCH',
                                        `/channels/${channelId}/messages/${messageEmbed.id}`,
                                        {
                                            embeds: [embed.footer(`Panel ID: ${messageEmbed.id}`)],
                                            components: [
                                                new Row(
                                                    Button.success(
                                                        'Open Ticket',
                                                        `tickets:open_${messageEmbed.id}`
                                                    ).emoji('🎫')
                                                )
                                            ]
                                        }
                                    );
                                } catch (e: any) {
                                    await this.bot.delete(channelId, messageEmbed.id).catch(console.error);
                                    console.error(e);
                                    return;
                                }
                            } else {
                                msg.reply(`Please fix the following errors:\n${errors.map(e => `- ${e}`).join('\n')}`);
                            }
                        } catch (e: any) {
                            console.error(e);
                        } finally {
                            this.activePanelSessions.delete(userId);
                        }
                    }
                );
            }
        },

        deletepanel: {
            description: "Delete a panel. Server admins only.",
            serverOnly: true,
            class: 'server',
            run: async (msg: any) => {
                // check user perms for admin OR if they have admin role
                const {
                    author_id: userId,
                    server_id: serverId
                } = msg;

                if (this.activePanelSessions.has(userId)) {
                    msg.reply('You already have an active panel session.');
                    return;
                }

                const user = await this.bot.member(serverId, userId);

                const {
                    error: serverNotFound, isAdmin
                } = await isAdminOrSupport(user, serverId, false);

                if (serverNotFound) {
                    msg.reply(serverNotFound);
                    return;
                }

                if (!isAdmin) {
                    msg.reply('You must have the admin role in order to add a panel.');
                    return;
                }

                const panelId = msg.argv[0];

                if (!panelId) {
                    msg.reply('Invalid syntax. Please use `/deletepanel <panelId>`.\n-# Find the panel ID via the panel embed.');
                    return;
                }

                const panel: any = db.prepare(`
                    SELECT *
                    FROM ticket_panels
                    WHERE message_id = ?
                `).get(panelId);

                if (!panel) {
                    msg.reply(`I couldn't find the panel you're trying to delete.`);
                    return;
                }

                try {
                    this.bot.delete(panel.channel_id, panelId);
                } catch (e: any) {
                    console.error(e);
                    msg.reply('An error occured and I could not delete the panel - check my permissions and try again.');
                    return;
                }

                db.prepare(`
                    DELETE FROM ticket_panels
                    WHERE message_id = ?
                `).run(panelId);

                msg.reply('I have deleted the panel!');
            }
        },

        addrole: {
            description: "Add an admin/support role. Server admins only.",
            serverOnly: true,
            class: 'server',
            run: async (msg: any) => {
                const [rawRoleType, role] = msg.argv;
                const roleType = (rawRoleType ?? '').toLowerCase();

                if (
                    !['admin', 'support'].includes(roleType)
                    || !(/^<@&([0-9a-fA-F-]{36})>$/.test(role))
                ) {
                    msg.reply('Invalid syntax. Please use `/addrole <admin OR support> <@role>`')
                    return;
                }

                const roleId = role.slice(2, -1);
                const column =
                    roleType === 'admin'
                        ? 'admin_roles'
                        : 'support_roles';

                const result: any = db.prepare(`
                    UPDATE servers
                    SET ${column} = json_insert(${column}, '$[#]', ?)
                    WHERE server_id = ?
                    AND NOT EXISTS (
                        SELECT 1
                        FROM json_each(servers.${column})
                        WHERE value = ?
                    )
                `).run(roleId, msg.server_id, roleId);

                if (result.changes === 0) {
                    msg.reply('Role already exists or server was not found.');
                    return;
                }

                msg.reply(`Successfully added <@&${roleId}> to ${roleType} roles.`);
            }
        },

        deleterole: {
            description: "Delete an admin/support role. Server admins only.",
            serverOnly: true,
            class: 'server',
            run: async (msg: any) => {
                const [rawRoleType, role] = msg.argv;
                const roleType = (rawRoleType ?? '').toLowerCase();

                if (
                    !['admin', 'support'].includes(roleType)
                    || !(/^<@&([0-9a-fA-F-]{36})>$/.test(role))
                ) {
                    msg.reply('Invalid syntax. Please use `/removerole <admin OR support> <@role>`')
                    return;
                }

                const roleId = role.slice(2, -1);
                const column =
                    roleType === 'admin'
                        ? 'admin_roles'
                        : 'support_roles';

                const result = db.prepare(`
                    UPDATE servers
                    SET ${column} = json_remove(
                        ${column},
                        (
                            SELECT '$[' || key || ']'
                            FROM json_each(servers.${column})
                            WHERE value = ?
                        )
                    )
                    WHERE server_id = ?
                    AND EXISTS (
                        SELECT 1
                        FROM json_each(servers.${column})
                        WHERE value = ?
                    )
                `).run(roleId, msg.server_id, roleId);

                if (result.changes === 0) {
                    msg.reply('Role does not exist or server was not found.');
                    return;
                }

                msg.reply(`Successfully removed <@&${roleId}> from ${roleType} roles.`);
            }
        },

        roles: {
            description: "See all the roles your server has",
            serverOnly: true,
            class: 'server',
            run: async (msg: any) => {
                const result: any = db.prepare(`
                    SELECT *
                    FROM servers
                    WHERE server_id = ?
                `).get(msg.server_id);

                const adminRoles = result.admin_roles;
                const supportRoles = result.support_roles;

                msg.reply(
                    `Admin roles: ${
                        adminRoles
                        ? JSON.parse(adminRoles).map((role: string) => `<@&${role}>`).join(', ')
                        : 'None'
                    }\n`
                    + `Support roles: ${
                        supportRoles
                        ? JSON.parse(supportRoles).map((role: string) => `<@&${role}>`).join(', ')
                        : 'None'
                    }`
                )
            }
        }
    }
}