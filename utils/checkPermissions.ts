import type Bot from "../dependencies/yapper";

/**
 * Check permissions of a user by looking through their role permissions.
 * @param bot The client class
 * @param serverId The ID of the server to look through
 * @param permissions An array of permissions you are looking for
 * @param user Leave `authorId` blank if `bot` is set to true. Leave `bot` empty if `authorId` contains a string.
 * @param exactMatch When true, requires all permissions. When false, requires at least one.
 */
export const checkPermissions = async (
    bot: Bot,
    serverId: string,
    permissions: string[],
    user: {
        authorId: string | null,
        bot: boolean | null
    },
    exactMatch: boolean = true
) => {
    if (user.authorId == null && user.bot == null)
        throw new Error("Must have a user ID or bot when checking permissions.");
    
    const botUser: any = await bot.api('GET', '/me');
    const member = user.bot
        ? await bot.member(serverId, botUser.id)
        : await bot.member(serverId, user.authorId!);

    const serverRoles = await bot.roles(serverId);

    const userPermissions = serverRoles
        .filter((role: any) => member.roles.includes(role.id))
        .flatMap((role: any) =>
            Object.entries(role.perms)
                .filter(([_, enabled]) => enabled === true)
                .map(([permission]) => permission)
        );

    return exactMatch
        ? permissions.every(permission => userPermissions.includes(permission))
        : permissions.some(permission => userPermissions.includes(permission));
};