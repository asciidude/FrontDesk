import { db } from "../bot";

export const isAdminOrSupport = async(member: any, serverId: string): Promise<{
    isSupport?: boolean,
    isAdmin?: boolean,
    error?: string
}> => {
    const server: any = db.prepare(`
        SELECT *
        FROM servers
        WHERE server_id = ?
    `).get(serverId);

    if (!server) {
        return {
            error: 'Server not found in our database. It may be improperly configured, try running `/setup` for guided setup.'
        }
    }

    const adminRoles = JSON.parse(server.admin_roles);
    const supportRoles = JSON.parse(server.support_roles);

    return {
        isAdmin: adminRoles.some((r: string) => member.roles.includes(r)),
        isSupport: supportRoles.some((r: string) => member.roles.includes(r))
    }
}