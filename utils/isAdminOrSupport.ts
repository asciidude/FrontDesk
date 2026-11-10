import { db } from "../bot";

export const isAdminOrSupport = async(member: any, serverId: string, dm?: boolean): Promise<{
    isSupport?: boolean,
    isAdmin?: boolean,
    error?: string,
    server?: any
}> => {
    const serverDb: any = db.prepare(`
        SELECT *
        FROM servers
        WHERE server_id = ?
    `).get(serverId);

    if (!serverDb) {
        return {
            error: 'Server not found in our database. It may be improperly configured, try running `/setup` for guided setup.'
        }
    }

    if(dm) {
        return {
            server: serverDb
        }
    }

    const adminRoles = JSON.parse(serverDb.admin_roles);
    const supportRoles = JSON.parse(serverDb.support_roles);

    return {
        isAdmin: adminRoles.some((r: string) => member.roles.includes(r)),
        isSupport: supportRoles.some((r: string) => member.roles.includes(r)),
        server: serverDb
    }
}