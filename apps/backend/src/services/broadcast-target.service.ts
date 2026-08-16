import prisma from '../lib/prisma.js';

export const BroadcastTargetService = {
  async list() {
    return prisma.broadcastTarget.findMany({ orderBy: { created_at: 'asc' } });
  },

  async create(data: { name: string; type: 'channel' | 'bot_broadcast'; channel_id?: string }) {
    if (data.type === 'channel' && !data.channel_id) {
      throw new Error('channel_id is required for channel targets');
    }
    return prisma.broadcastTarget.create({ data });
  },

  async update(id: string, data: Partial<{ name: string; channel_id: string; is_active: boolean }>) {
    return prisma.broadcastTarget.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.broadcastTarget.delete({ where: { id } });
  },
};
