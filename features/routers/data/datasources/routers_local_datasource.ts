import { databaseHelper } from '../../../../core/database/database_helper';
import { Router, RouterResponse } from '../../domain/entities/router';

export class RoutersLocalDataSource {
  /**
   * Save routers to local SQLite database.
   */
  async saveRouters(routers: RouterResponse[]): Promise<void> {
    try {
      const rows = routers.map((r) => ({
        id: r.id,
        uuid: r.uuid ?? null,
        name: r.name,
        mac: r.mac ?? null,
        mac_5g: r.mac_5g ?? null,
        ssid: r.ssid ?? null,
        ssid5g: r.ssid5g ?? null,
        city: r.city ?? null,
        region: r.region ?? null,
        country: r.country ?? null,
        latitude: typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude,
        longitude: typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude,
        config: r.config ?? null,
      }));
      await databaseHelper.saveRouters(rows);
      console.log(`[RoutersLocal] Saved ${rows.length} routers to cache`);
    } catch (error) {
      console.error('[RoutersLocal] saveRouters error:', error);
      throw error;
    }
  }

  /**
   * Get all cached routers from local database.
   */
  async getRouters(): Promise<Router[]> {
    try {
      const rows = await databaseHelper.getRouters();
      return this.mapToEntity(rows);
    } catch (error) {
      console.error('[RoutersLocal] getRouters error:', error);
      return [];
    }
  }

  /**
   * Maps DB rows back to Router entity.
   */
  private mapToEntity(rows: any[]): Router[] {
    return rows.map((row) => ({
      id: row.id,
      uuid: row.uuid ?? undefined,
      name: row.name,
      mac: row.mac ?? undefined,
      mac_5g: row.mac_5g ?? undefined,
      ssid: row.ssid ?? undefined,
      ssid5g: row.ssid5g ?? undefined,
      city: row.city ?? undefined,
      region: row.region ?? undefined,
      country: row.country ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      config: row.config ?? undefined,
    }));
  }
}

export const routersLocalDataSource = new RoutersLocalDataSource();
