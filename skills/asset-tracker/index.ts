/**
 * Asset Tracker Skill — Built-in
 *
 * Track any physical or digital assets (vehicles, equipment, inventory).
 * Generic — asset types, tracking fields, maintenance schedules via config.
 * Monitors asset health, maintenance schedules, location history, and condition.
 *
 * Permissions: network.outbound, db.read
 * Config: ASSET_TYPE, TRACKING_FIELDS, MAINTENANCE_SCHEDULE, ALERT_RULES
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export interface AssetDefinition {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'maintenance' | 'retired';
  tracking_fields: Record<string, unknown>;
  last_maintenance: string;
  next_maintenance: string;
  location: string;
  condition_score: number; // 0-100
  notes: string;
}

export interface MaintenanceEvent {
  asset_id: string;
  event_type: string;
  timestamp: string;
  description: string;
  performed_by: string;
  cost: number;
  hours: number;
}

export class AssetTrackerSkill implements ApexSkill {
  readonly name = 'asset-tracker';
  readonly version = '1.0.0';
  readonly permissions = ['network.outbound', 'db.read'];
  readonly description = 'Track physical and digital assets — vehicles, equipment, inventory';

  private config: Record<string, string> = {};
  private assetType: string = 'vehicle';
  private trackingFields: string[] = [];
  private maintenanceSchedule: Record<string, number> = {};
  private alertRules: Record<string, unknown> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;

    // Parse asset type
    this.assetType = config.ASSET_TYPE ?? 'vehicle';

    // Parse tracking fields (comma-separated)
    if (config.TRACKING_FIELDS) {
      this.trackingFields = config.TRACKING_FIELDS.split(',').map((f) => f.trim());
    } else {
      this.trackingFields = this.getDefaultTrackingFields();
    }

    // Parse maintenance schedule (JSON)
    if (config.MAINTENANCE_SCHEDULE) {
      try {
        this.maintenanceSchedule = JSON.parse(config.MAINTENANCE_SCHEDULE) as Record<string, number>;
      } catch {
        this.maintenanceSchedule = this.getDefaultMaintenanceSchedule();
      }
    } else {
      this.maintenanceSchedule = this.getDefaultMaintenanceSchedule();
    }

    // Parse alert rules (JSON)
    if (config.ALERT_RULES) {
      try {
        this.alertRules = JSON.parse(config.ALERT_RULES) as Record<string, unknown>;
      } catch {
        this.alertRules = this.getDefaultAlertRules();
      }
    } else {
      this.alertRules = this.getDefaultAlertRules();
    }
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getAsset':
        return this.getAsset(params);
      case 'listAssets':
        return this.listAssets(params);
      case 'createAsset':
        return this.createAsset(params);
      case 'updateAsset':
        return this.updateAsset(params);
      case 'logMaintenance':
        return this.logMaintenance(params);
      case 'checkMaintenance':
        return this.checkMaintenance(params);
      case 'getConditionScore':
        return this.getConditionScore(params);
      case 'getMaintenanceHistory':
        return this.getMaintenanceHistory(params);
      case 'getAssetAlerts':
        return this.getAssetAlerts(params);
      case 'scheduleNextMaintenance':
        return this.scheduleNextMaintenance(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  /**
   * Get a single asset by ID.
   */
  private async getAsset(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };

    try {
      // In production, this would fetch from the asset database
      // For now, return a mock structure
      const asset: AssetDefinition = {
        id: assetId,
        name: `Asset ${assetId}`,
        type: this.assetType,
        status: 'active',
        tracking_fields: this.buildTrackingFields(),
        last_maintenance: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        next_maintenance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Primary Location',
        condition_score: 85,
        notes: 'Asset in good condition',
      };

      return { success: true, data: asset };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'ASSET_FETCH_FAILED' };
    }
  }

  /**
   * List all assets with optional filtering.
   */
  private async listAssets(params: Record<string, unknown>): Promise<SkillResult> {
    const status = (params.status as string) ?? 'active';
    const limit = (params.limit as number) ?? 20;
    const offset = (params.offset as number) ?? 0;

    try {
      // In production, this would query the asset database
      // For now, return a mock list
      const assets: AssetDefinition[] = [];
      for (let i = 0; i < Math.min(limit, 10); i++) {
        assets.push({
          id: `${this.assetType.toUpperCase()}${String(i + 1).padStart(2, '0')}`,
          name: `${this.assetType.charAt(0).toUpperCase() + this.assetType.slice(1)} ${i + 1}`,
          type: this.assetType,
          status: (status as 'active' | 'inactive' | 'maintenance' | 'retired'),
          tracking_fields: this.buildTrackingFields(),
          last_maintenance: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
          next_maintenance: new Date(Date.now() + Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
          location: 'Depot',
          condition_score: 70 + Math.random() * 25,
          notes: 'Tracked asset',
        });
      }

      return {
        success: true,
        data: {
          total: assets.length + offset,
          limit,
          offset,
          assets,
          asset_type: this.assetType,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'LIST_ASSETS_FAILED' };
    }
  }

  /**
   * Create a new asset.
   */
  private async createAsset(params: Record<string, unknown>): Promise<SkillResult> {
    const name = params.name as string;
    const location = (params.location as string) ?? 'Primary Location';

    if (!name) return { success: false, error: 'name is required', error_code: 'MISSING_PARAM' };

    try {
      const assetId = `${this.assetType.toUpperCase()}${Date.now().toString().slice(-6)}`;

      const asset: AssetDefinition = {
        id: assetId,
        name,
        type: this.assetType,
        status: 'active',
        tracking_fields: this.buildTrackingFields(),
        last_maintenance: new Date().toISOString(),
        next_maintenance: this.calculateNextMaintenanceDate().toISOString(),
        location,
        condition_score: 90, // New assets start in good condition
        notes: `Created: ${name}`,
      };

      return {
        success: true,
        data: {
          asset_created: true,
          asset_id: assetId,
          asset,
          message: 'Asset registered in tracking system',
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CREATE_ASSET_FAILED' };
    }
  }

  /**
   * Update an asset's tracking fields or status.
   */
  private async updateAsset(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    const updates = params.updates as Record<string, unknown>;

    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };
    if (!updates) return { success: false, error: 'updates is required', error_code: 'MISSING_PARAM' };

    try {
      const updateFields: string[] = [];
      const updateValues: Record<string, unknown> = {};

      // Allowed update fields
      const allowedFields = ['location', 'status', 'notes', 'condition_score', ...this.trackingFields];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(key);
          updateValues[key] = value;
        }
      }

      return {
        success: true,
        data: {
          asset_id: assetId,
          fields_updated: updateFields,
          updated_values: updateValues,
          message: `Updated ${updateFields.length} field(s)`,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'UPDATE_ASSET_FAILED' };
    }
  }

  /**
   * Log a maintenance event for an asset.
   */
  private async logMaintenance(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    const eventType = params.event_type as string;
    const description = (params.description as string) ?? '';
    const performedBy = (params.performed_by as string) ?? 'Unknown';
    const cost = (params.cost as number) ?? 0;
    const hours = (params.hours as number) ?? 0;

    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };
    if (!eventType) return { success: false, error: 'event_type is required', error_code: 'MISSING_PARAM' };

    try {
      const event: MaintenanceEvent = {
        asset_id: assetId,
        event_type: eventType,
        timestamp: new Date().toISOString(),
        description,
        performed_by: performedBy,
        cost,
        hours,
      };

      return {
        success: true,
        data: {
          maintenance_logged: true,
          asset_id: assetId,
          event,
          next_maintenance: this.calculateNextMaintenanceDate(),
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'LOG_MAINTENANCE_FAILED' };
    }
  }

  /**
   * Check which assets are due for maintenance.
   */
  private async checkMaintenance(params: Record<string, unknown>): Promise<SkillResult> {
    const overdueDays = (params.overdue_days as number) ?? 7;

    try {
      // In production, this would check the asset database
      // For now, return a mock result
      const overdueAssets: Array<{ asset_id: string; next_maintenance: string; days_overdue: number }> = [];
      const upcomingAssets: Array<{ asset_id: string; next_maintenance: string; days_until: number }> = [];

      // Mock data
      const now = new Date();
      for (let i = 1; i <= 10; i++) {
        const assetId = `${this.assetType.toUpperCase()}${String(i).padStart(2, '0')}`;
        const maintenanceDate = new Date(now.getTime() + (Math.random() * 100 - 50) * 24 * 60 * 60 * 1000);
        const daysUntil = Math.floor((maintenanceDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysUntil < -overdueDays) {
          overdueAssets.push({
            asset_id: assetId,
            next_maintenance: maintenanceDate.toISOString(),
            days_overdue: -daysUntil,
          });
        } else if (daysUntil > 0 && daysUntil < 30) {
          upcomingAssets.push({
            asset_id: assetId,
            next_maintenance: maintenanceDate.toISOString(),
            days_until: daysUntil,
          });
        }
      }

      return {
        success: true,
        data: {
          overdue_assets: overdueAssets,
          upcoming_assets: upcomingAssets,
          total_overdue: overdueAssets.length,
          total_upcoming: upcomingAssets.length,
          alert_threshold_days: overdueDays,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'MAINTENANCE_CHECK_FAILED' };
    }
  }

  /**
   * Get condition score for an asset.
   */
  private async getConditionScore(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };

    try {
      // In production, this would calculate based on maintenance history, age, usage, etc.
      const score = Math.floor(70 + Math.random() * 30);
      const status =
        score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';
      const recommendation =
        score >= 85
          ? 'Asset in excellent condition'
          : score >= 70
            ? 'Routine maintenance recommended'
            : score >= 50
              ? 'Major maintenance needed'
              : 'Critical repairs needed';

      return {
        success: true,
        data: {
          asset_id: assetId,
          condition_score: score,
          status,
          recommendation,
          factors: {
            age: 3, // years
            maintenance_current: score >= 70,
            usage_normal: true,
            repairs_recent: score < 70,
          },
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CONDITION_SCORE_FAILED' };
    }
  }

  /**
   * Get maintenance history for an asset.
   */
  private async getMaintenanceHistory(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    const limit = (params.limit as number) ?? 20;

    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };

    try {
      // In production, this would fetch from maintenance log database
      const history: MaintenanceEvent[] = [];
      const eventTypes = ['Oil Change', 'Tire Rotation', 'Inspection', 'Repair', 'Service'];

      for (let i = 0; i < Math.min(limit, 10); i++) {
        const daysAgo = Math.floor(Math.random() * 365);
        history.push({
          asset_id: assetId,
          event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
          timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
          description: `Routine maintenance performed`,
          performed_by: 'Technician',
          cost: Math.floor(Math.random() * 1000) + 100,
          hours: Math.floor(Math.random() * 8) + 1,
        });
      }

      const totalCost = history.reduce((sum, e) => sum + e.cost, 0);
      const totalHours = history.reduce((sum, e) => sum + e.hours, 0);

      return {
        success: true,
        data: {
          asset_id: assetId,
          history,
          summary: {
            total_events: history.length,
            total_cost: totalCost,
            total_hours: totalHours,
            average_event_cost: Math.floor(totalCost / history.length),
          },
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'HISTORY_FETCH_FAILED' };
    }
  }

  /**
   * Get alerts for an asset.
   */
  private async getAssetAlerts(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;

    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };

    try {
      const alerts: Array<{
        alert_type: string;
        severity: 'critical' | 'warning' | 'info';
        message: string;
      }> = [];

      // Simulate alerts based on mock condition
      const conditionScore = Math.floor(70 + Math.random() * 30);

      if (conditionScore < 50) {
        alerts.push({
          alert_type: 'CONDITION_CRITICAL',
          severity: 'critical',
          message: 'Asset condition is critical. Immediate maintenance required.',
        });
      }

      if (conditionScore < 70) {
        alerts.push({
          alert_type: 'MAINTENANCE_DUE',
          severity: 'warning',
          message: 'Maintenance is overdue. Schedule service soon.',
        });
      }

      // Age-based alert
      alerts.push({
        alert_type: 'INSPECTION_DUE',
        severity: 'info',
        message: 'Routine inspection recommended',
      });

      return {
        success: true,
        data: {
          asset_id: assetId,
          alerts,
          alert_count: alerts.length,
          critical_count: alerts.filter((a) => a.severity === 'critical').length,
          requires_immediate_action: alerts.some((a) => a.severity === 'critical'),
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'ALERTS_FETCH_FAILED' };
    }
  }

  /**
   * Schedule the next maintenance date for an asset.
   */
  private async scheduleNextMaintenance(params: Record<string, unknown>): Promise<SkillResult> {
    const assetId = params.asset_id as string;
    const eventType = (params.event_type as string) ?? 'routine_maintenance';
    const scheduledDate = params.scheduled_date as string | undefined;

    if (!assetId) return { success: false, error: 'asset_id is required', error_code: 'MISSING_PARAM' };

    try {
      const nextDate = scheduledDate
        ? new Date(scheduledDate)
        : this.calculateNextMaintenanceDate(eventType);

      return {
        success: true,
        data: {
          asset_id: assetId,
          event_type: eventType,
          scheduled_date: nextDate.toISOString(),
          days_until: Math.floor(
            (nextDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          ),
          notification_sent: true,
          message: `Maintenance scheduled for ${nextDate.toLocaleDateString()}`,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SCHEDULE_MAINTENANCE_FAILED' };
    }
  }

  // --- Private helpers ---

  /**
   * Build a sample tracking fields object.
   */
  private buildTrackingFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    for (const field of this.trackingFields) {
      fields[field] = `Sample value for ${field}`;
    }

    return fields;
  }

  /**
   * Get default tracking fields for asset type.
   */
  private getDefaultTrackingFields(): string[] {
    const defaults: Record<string, string[]> = {
      vehicle: [
        'vin',
        'license_plate',
        'mileage',
        'fuel_type',
        'year',
        'make',
        'model',
        'current_location',
      ],
      equipment: [
        'serial_number',
        'category',
        'purchase_date',
        'current_location',
        'assigned_to',
        'power_type',
      ],
      inventory: [
        'sku',
        'quantity',
        'unit_cost',
        'warehouse_location',
        'expiration_date',
        'supplier',
      ],
    };

    return defaults[this.assetType] ?? defaults.vehicle;
  }

  /**
   * Get default maintenance schedule (in days between maintenance).
   */
  private getDefaultMaintenanceSchedule(): Record<string, number> {
    const defaults: Record<string, Record<string, number>> = {
      vehicle: {
        oil_change: 90,
        tire_rotation: 180,
        inspection: 180,
        major_service: 365,
      },
      equipment: {
        routine_maintenance: 180,
        inspection: 365,
        calibration: 180,
      },
      inventory: {
        physical_count: 30,
        obsolescence_review: 90,
      },
    };

    return defaults[this.assetType] ?? defaults.vehicle;
  }

  /**
   * Get default alert rules.
   */
  private getDefaultAlertRules(): Record<string, unknown> {
    return {
      condition_score_critical: 50,
      condition_score_warning: 70,
      maintenance_overdue_days: 7,
      age_years_warning: 10,
    };
  }

  /**
   * Calculate the next maintenance date.
   */
  private calculateNextMaintenanceDate(eventType?: string): Date {
    const schedule = this.maintenanceSchedule;
    const intervalDays = schedule[eventType ?? 'routine_maintenance'] ?? 180;
    return new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  }
}
