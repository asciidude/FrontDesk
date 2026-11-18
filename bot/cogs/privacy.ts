
import { db } from "..";
import { Button, Cog, Embed, Row } from "../../dependencies/yapper";
import { checkPermissions } from "../../utils/checkPermissions";

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

async function processBatches<T>(
    items: T[],
    action: (item: T) => Promise<void>,
    batchSize = 5
) {
    const failures: Array<{ item?: T; error: unknown }> = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map(action)
        );

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                failures.push({
                    item: batch[index],
                    error: result.reason
                });
            }
        });

        if (i + batchSize < items.length) {
            await sleep(1000);
        }
    }

    if (failures.length) {
        throw new AggregateError(
            failures.map(f => f.error),
            `${failures.length} operations failed`
        );
    }
}

export class Privacy extends Cog {
    commands = {
        privacy: {
            description: 'View our Privacy Policy, Terms of Service, and manage your data.',

            run: async (msg: any) => {
                const userId = msg.author_id;
                const serverId = msg.server_id;

                let isAdmin = false;

                if (serverId) {
                    isAdmin = await checkPermissions(
                        this.bot,
                        serverId,
                        ['administrator'],
                        {
                            authorId: userId,
                            bot: false
                        }
                    ).catch(() => false);
                }

                const embed = new Embed({
                    title: 'Privacy & Terms of Service',
                    description:
                        'View our [Terms of Service](https://github.com/asciidude/FrontDesk/blob/main/TERMS.md).\n' +
                        'View our [Privacy Policy](https://github.com/asciidude/FrontDesk/blob/main/PRIVACY.md).\n\n' +
                        '**Delete User Data** permanently deletes your tickets and associated ticket channels, as well as your FrontDesk account data.\n' +
                        '**Delete Server Data** permanently deletes all tickets, panels, and associated server resources.\n\n' +
                        '⚠️ **Purchases cannot be restored after service deletion.** This action is permanent & cannot be undone.'
                });

                const components = [
                    new Row(

                    )
                ];

                if (serverId && isAdmin) {
                    components.push(
                        new Row(

                        )
                    );
                }

                const options = {
                    embeds: [embed],
                    components: [
                        new Row(
                            Button.danger(
                                'Delete User Data',
                                'privacy:delete_user'
                            ).emoji('👤'),
                            ...(serverId && isAdmin
                                ? [
                                    Button.danger(
                                        'Delete Server Data',
                                        'privacy:delete_server'
                                    ).emoji('📋')
                                ]
                                : [])
                        )
                    ]
                };

                if (msg.dm) {
                    await this.bot.dmSend(
                        userId,
                        '',
                        options
                    );
                } else {
                    await msg.reply('', options);
                }
            }
        }
    };

    cogLoad() {
        this.bot.onButton('privacy:delete_user', async (i: any) => {
            const userId = i.user_id;
            if (!userId) return;

            i.ephemeral(
                '**Are you absolutely sure?**\n\n' +
                'This will permanently delete all tickets you opened, their associated channels, and your FrontDesk user record.\n\n' +
                '**This action __cannot__ be undone.**',
                {
                    components: [
                        new Row(
                            Button.danger(
                                'Confirm Deletion',
                                'privacy:confirm_user'
                            ).emoji('🫡'),
                            Button.secondary(
                                'Cancel',
                                'privacy:cancel'
                            ).emoji('🙅')
                        )
                    ]
                }
            );
        });

        this.bot.onButton('privacy:confirm_user', async (i: any) => {
            const userId = i.user_id;

            if (!userId) return;

            const tickets: any[] = db.prepare(`
                SELECT *
                FROM tickets
                WHERE opened_by = ?
            `).all(userId);

            try {
                await processBatches(
                    tickets,
                    async ticket => {
                        await this.bot.deleteChannel(ticket.channel_id);
                    }
                );

                db.transaction(() => {
                    db.prepare(`
                        DELETE FROM tickets
                        WHERE opened_by = ?
                    `).run(userId);

                    db.prepare(`
                        DELETE FROM users
                        WHERE user_id = ?
                    `).run(userId);
                })();

                await i.ephemeral('Your user data and associated tickets have been deleted.',);
            } catch (error) {
                console.error(error);

                await i.ephemeral('Deletion could not be completed - some resources may remain. Please contact support.',);
            }
        });

        this.bot.onButton('privacy:delete_server', async (i: any) => {
            const {
                server_id: serverId,
                user_id: authorId
            } = i;

            if (!serverId || !authorId) return;

            const isAdmin = await checkPermissions(
                this.bot,
                serverId,
                ['administrator'],
                {
                    authorId,
                    bot: false
                }
            ).catch(() => false);

            if (!isAdmin) return;

            await i.ephemeral(
                '**Are you absolutely sure?**\n\n' +
                'This permanently deletes all server tickets, ticket channels, panels, panel messages, and ticket categories.\n\n' +
                'Doing so also deletes past purchases & subscriptions. **These cannot be restored after deletion.**\n\n' +
                '**This action __cannot__ be undone.**',
                {
                    components: [
                        new Row(
                            Button.danger(
                                'Confirm Deletion',
                                'privacy:confirm_server'
                            ).emoji('🫡'),
                            Button.secondary(
                                'Cancel',
                                'privacy:cancel'
                            ).emoji('🙅')
                        )
                    ]
                }
            );
        });

        this.bot.onButton('privacy:confirm_server', async (i: any) => {
            const {
                server_id: serverId,
                user_id: authorId
            } = i;

            if (!serverId || !authorId) return;

            const isAdmin = await checkPermissions(
                this.bot,
                serverId,
                ['administrator'],
                {
                    authorId,
                    bot: false
                }
            ).catch(() => false);

            if (!isAdmin) return;

            const server: any = db.prepare(`
                SELECT *
                FROM servers
                WHERE server_id = ?
            `).get(serverId);

            if (!server) return;

            try {
                const panels: any[] = db.prepare(`
                    SELECT *
                    FROM ticket_panels
                    WHERE server_id = ?
                `).all(serverId);

                await processBatches(
                    panels,
                    async panel => {
                        try {
                            await this.bot.delete(
                                panel.channel_id,
                                panel.message_id
                            );
                        } catch (e: any) {
                            console.error(e);
                        }
                    }
                );

                const tickets: any[] = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE server_id = ?
                `).all(serverId);

                await processBatches(
                    tickets,
                    async ticket => {
                        try { 
                            await this.bot.deleteChannel(
                                ticket.channel_id
                            );
                        } catch (e: any) {
                            console.error(e);
                        }
                    }
                );

                const categoryIds = [
                    server.open_ticket_category,
                    server.closed_ticket_category
                ].filter(Boolean);

                await processBatches(
                    categoryIds,
                    async categoryId => {
                        try {
                            await this.bot.deleteCategory(
                                serverId,
                                categoryId
                            );
                        } catch (e: any) {
                            console.error(e);
                        }
                    }
                );

                db.transaction(() => {
                    db.prepare(`
                        DELETE FROM tickets
                        WHERE server_id = ?
                    `).run(serverId);

                    db.prepare(`
                        DELETE FROM servers
                        WHERE server_id = ?
                    `).run(serverId);
                })();

                await i.reply('All server data and associated resources have been deleted.');
            } catch (error) {
                console.error(error);

                await i.ephemeral('Server deletion could not be fully completed - some resources may remain. Please contact support.',);
            }
        });

        this.bot.onButton('privacy:cancel', async (i: any) => {
            await i.ephemeral('Deletion cancelled.');
        });

        console.log('[COGS] Privacy commands loaded.');
    }
}
