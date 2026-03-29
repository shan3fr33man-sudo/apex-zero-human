/**
 * APEX Database Types
 * Verified against live Supabase project: yjuapqvdyhvjtpwwaoqa
 * Migrations 001-012 deployed 2026-03-27.
 *
 * To regenerate from live schema:
 *   npx supabase gen types typescript --project-id yjuapqvdyhvjtpwwaoqa > packages/db/types.ts
 *
 * 20 public tables, 2 views, 3 functions, 6 see_internal tables.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          domain: string | null;
          logo_url: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          domain?: string | null;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          domain?: string | null;
          logo_url?: string | null;
          settings?: Json;
          updated_at?: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          slug: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          slug: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          slug?: string;
          settings?: Json;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          auth_id: string | null;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'owner' | 'admin' | 'member' | 'viewer';
          onboarded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          onboarded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string | null;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          onboarded?: boolean;
          updated_at?: string;
        };
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: 'owner' | 'admin' | 'member' | 'viewer';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
        };
      };
      companies: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          goal: string | null;
          brand_guide_url: string | null;
          template_id: string | null;
          status: 'active' | 'paused' | 'suspended';
          token_budget: number;
          tokens_used: number;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          slug: string;
          goal?: string | null;
          brand_guide_url?: string | null;
          template_id?: string | null;
          status?: 'active' | 'paused' | 'suspended';
          token_budget?: number;
          tokens_used?: number;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          goal?: string | null;
          brand_guide_url?: string | null;
          template_id?: string | null;
          status?: 'active' | 'paused' | 'suspended';
          token_budget?: number;
          tokens_used?: number;
          settings?: Json;
          updated_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          role: string;
          persona: string | null;
          model_tier: 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';
          reports_to: string | null;
          status: 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';
          heartbeat_config: Json;
          custom_rules: string[];
          installed_skills: string[];
          avg_quality_score: number | null;
          total_tokens_used: number;
          total_tasks_done: number;
          current_issue_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          role: string;
          persona?: string | null;
          model_tier?: 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';
          reports_to?: string | null;
          status?: 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';
          heartbeat_config?: Json;
          custom_rules?: string[];
          installed_skills?: string[];
          avg_quality_score?: number | null;
          total_tokens_used?: number;
          total_tasks_done?: number;
          current_issue_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          role?: string;
          persona?: string | null;
          model_tier?: 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';
          reports_to?: string | null;
          status?: 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';
          heartbeat_config?: Json;
          custom_rules?: string[];
          installed_skills?: string[];
          avg_quality_score?: number | null;
          total_tokens_used?: number;
          total_tasks_done?: number;
          current_issue_id?: string | null;
          updated_at?: string;
        };
      };
      issues: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          description: string | null;
          success_condition: string | null;
          status: 'open' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'human_review_required';
          priority: number;
          assigned_to: string | null;
          locked_by: string | null;
          locked_at: string | null;
          stall_threshold_minutes: number;
          quality_score: number | null;
          tokens_used: number;
          parent_issue_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          description?: string | null;
          success_condition?: string | null;
          status?: 'open' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'human_review_required';
          priority?: number;
          assigned_to?: string | null;
          locked_by?: string | null;
          locked_at?: string | null;
          stall_threshold_minutes?: number;
          quality_score?: number | null;
          tokens_used?: number;
          parent_issue_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          title?: string;
          description?: string | null;
          success_condition?: string | null;
          status?: 'open' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'human_review_required';
          priority?: number;
          assigned_to?: string | null;
          locked_by?: string | null;
          locked_at?: string | null;
          stall_threshold_minutes?: number;
          quality_score?: number | null;
          tokens_used?: number;
          parent_issue_id?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
      issue_dependencies: {
        Row: {
          id: string;
          issue_id: string;
          blocked_by_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          blocked_by_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          blocked_by_id?: string;
        };
      };
      issue_comments: {
        Row: {
          id: string;
          issue_id: string;
          agent_id: string | null;
          user_id: string | null;
          content: string;
          comment_type: 'progress' | 'handoff' | 'artifact' | 'review' | 'system';
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          agent_id?: string | null;
          user_id?: string | null;
          content: string;
          comment_type?: 'progress' | 'handoff' | 'artifact' | 'review' | 'system';
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          agent_id?: string | null;
          user_id?: string | null;
          content?: string;
          comment_type?: 'progress' | 'handoff' | 'artifact' | 'review' | 'system';
          metadata?: Json;
        };
      };
      agent_memories: {
        Row: {
          id: string;
          agent_id: string;
          company_id: string;
          memory_type: 'identity' | 'plan' | 'learning' | 'rule' | 'context';
          content: string;
          embedding: string | null;
          relevance_score: number;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          company_id: string;
          memory_type: 'identity' | 'plan' | 'learning' | 'rule' | 'context';
          content: string;
          embedding?: string | null;
          relevance_score?: number;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          company_id?: string;
          memory_type?: 'identity' | 'plan' | 'learning' | 'rule' | 'context';
          content?: string;
          embedding?: string | null;
          relevance_score?: number;
          expires_at?: string | null;
        };
      };
      skills: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          source_url: string | null;
          commit_sha: string | null;
          version: string;
          permissions: string[];
          safety_score: number;
          verified: boolean;
          is_builtin: boolean;
          config: Json;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string | null;
          source_url?: string | null;
          commit_sha?: string | null;
          version?: string;
          permissions?: string[];
          safety_score?: number;
          verified?: boolean;
          is_builtin?: boolean;
          config?: Json;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          description?: string | null;
          source_url?: string | null;
          commit_sha?: string | null;
          version?: string;
          permissions?: string[];
          safety_score?: number;
          verified?: boolean;
          is_builtin?: boolean;
          config?: Json;
          enabled?: boolean;
          updated_at?: string;
        };
      };
      agent_skills: {
        Row: {
          id: string;
          agent_id: string;
          skill_id: string;
          granted_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          skill_id: string;
          granted_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          skill_id?: string;
        };
      };
      routines: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          routine_type: 'SCHEDULED' | 'REACTIVE';
          cron_expr: string | null;
          next_run_at: string | null;
          last_run_at: string | null;
          event_pattern: string | null;
          assigned_to_role: string;
          issue_template: Json;
          enabled: boolean;
          run_count: number;
          last_status: 'success' | 'failed' | 'running' | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          routine_type: 'SCHEDULED' | 'REACTIVE';
          cron_expr?: string | null;
          next_run_at?: string | null;
          last_run_at?: string | null;
          event_pattern?: string | null;
          assigned_to_role: string;
          issue_template?: Json;
          enabled?: boolean;
          run_count?: number;
          last_status?: 'success' | 'failed' | 'running' | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          routine_type?: 'SCHEDULED' | 'REACTIVE';
          cron_expr?: string | null;
          next_run_at?: string | null;
          last_run_at?: string | null;
          event_pattern?: string | null;
          assigned_to_role?: string;
          issue_template?: Json;
          enabled?: boolean;
          run_count?: number;
          last_status?: 'success' | 'failed' | 'running' | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
      routine_runs: {
        Row: {
          id: string;
          routine_id: string;
          company_id: string;
          issue_id: string | null;
          status: 'success' | 'failed' | 'running';
          tokens_used: number;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          routine_id: string;
          company_id: string;
          issue_id?: string | null;
          status: 'success' | 'failed' | 'running';
          tokens_used?: number;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          routine_id?: string;
          company_id?: string;
          issue_id?: string | null;
          status?: 'success' | 'failed' | 'running';
          tokens_used?: number;
          error?: string | null;
          completed_at?: string | null;
        };
      };
      events: {
        Row: {
          id: string;
          company_id: string;
          event_type: string;
          source: string;
          payload: Json;
          processed: boolean;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          event_type: string;
          source: string;
          payload?: Json;
          processed?: boolean;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          event_type?: string;
          source?: string;
          payload?: Json;
          processed?: boolean;
          processed_at?: string | null;
        };
      };
      token_spend_log: {
        Row: {
          id: string;
          company_id: string;
          agent_id: string | null;
          issue_id: string | null;
          model: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cost_usd: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          agent_id?: string | null;
          issue_id?: string | null;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          agent_id?: string | null;
          issue_id?: string | null;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number | null;
        };
      };
      audit_log: {
        Row: {
          id: string;
          company_id: string | null;
          agent_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_state: Json | null;
          after_state: Json | null;
          reversible: boolean;
          reversed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          agent_id?: string | null;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          reversible?: boolean;
          reversed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          agent_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          reversible?: boolean;
          reversed_at?: string | null;
        };
      };
      inbox_items: {
        Row: {
          id: string;
          company_id: string;
          item_type: 'HIRE_APPROVAL' | 'BUDGET_ALERT' | 'STALL_ALERT' | 'PERSONA_PATCH' | 'IRREVERSIBLE_ACTION' | 'HUMAN_REVIEW_REQUIRED' | 'SYSTEM_ALERT';
          title: string;
          description: string | null;
          payload: Json;
          status: 'pending' | 'approved' | 'rejected' | 'dismissed';
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          item_type: 'HIRE_APPROVAL' | 'BUDGET_ALERT' | 'STALL_ALERT' | 'PERSONA_PATCH' | 'IRREVERSIBLE_ACTION' | 'HUMAN_REVIEW_REQUIRED' | 'SYSTEM_ALERT';
          title: string;
          description?: string | null;
          payload?: Json;
          status?: 'pending' | 'approved' | 'rejected' | 'dismissed';
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          item_type?: 'HIRE_APPROVAL' | 'BUDGET_ALERT' | 'STALL_ALERT' | 'PERSONA_PATCH' | 'IRREVERSIBLE_ACTION' | 'HUMAN_REVIEW_REQUIRED' | 'SYSTEM_ALERT';
          title?: string;
          description?: string | null;
          payload?: Json;
          status?: 'pending' | 'approved' | 'rejected' | 'dismissed';
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
      };
      agent_performance: {
        Row: {
          id: string;
          company_id: string;
          agent_id: string;
          issue_id: string | null;
          quality_score: number;
          evaluation_notes: string | null;
          evaluator_agent_id: string | null;
          period_start: string | null;
          period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          agent_id: string;
          issue_id?: string | null;
          quality_score: number;
          evaluation_notes?: string | null;
          evaluator_agent_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          agent_id?: string;
          issue_id?: string | null;
          quality_score?: number;
          evaluation_notes?: string | null;
          evaluator_agent_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
        };
      };
      agent_heartbeats: {
        Row: {
          id: string;
          agent_id: string;
          issue_id: string;
          state: 'IDENTITY_CONFIRMED' | 'MEMORY_LOADED' | 'PLAN_READ' | 'ASSIGNMENT_CLAIMED' | 'EXECUTING' | 'HANDOFF_COMPLETE' | 'FAILED';
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          issue_id: string;
          state: 'IDENTITY_CONFIRMED' | 'MEMORY_LOADED' | 'PLAN_READ' | 'ASSIGNMENT_CLAIMED' | 'EXECUTING' | 'HANDOFF_COMPLETE' | 'FAILED';
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          issue_id?: string;
          state?: 'IDENTITY_CONFIRMED' | 'MEMORY_LOADED' | 'PLAN_READ' | 'ASSIGNMENT_CLAIMED' | 'EXECUTING' | 'HANDOFF_COMPLETE' | 'FAILED';
          error_message?: string | null;
          completed_at?: string | null;
        };
      };
    };
    Views: {
      daily_token_spend: {
        Row: {
          company_id: string;
          day: string;
          model: string;
          total_input_tokens: number;
          total_output_tokens: number;
          total_tokens: number;
          total_cost_usd: number;
          api_calls: number;
        };
      };
      agent_token_spend: {
        Row: {
          company_id: string;
          agent_id: string;
          model: string;
          total_input_tokens: number;
          total_output_tokens: number;
          total_tokens: number;
          total_cost_usd: number;
          api_calls: number;
        };
      };
    };
    Functions: {
      check_and_deduct_tokens: {
        Args: {
          p_company_id: string;
          p_tokens_needed: number;
        };
        Returns: boolean;
      };
      claim_issue: {
        Args: {
          p_issue_id: string;
          p_agent_id: string;
        };
        Returns: boolean;
      };
      search_agent_memories: {
        Args: {
          p_agent_id: string;
          p_query_embedding: string;
          p_limit?: number;
        };
        Returns: {
          id: string;
          content: string;
          memory_type: string;
          similarity: number;
        }[];
      };
    };
    Enums: {};
  };
  see_internal: {
    Tables: {
      discoveries: {
        Row: {
          id: string;
          title: string;
          source_url: string | null;
          source_tier: string;
          relevance_score: number;
          impact_category: string;
          urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
          raw_summary: string | null;
          status: 'new' | 'mapped' | 'testing' | 'deployed' | 'rejected' | 'archived';
          discovered_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          source_url?: string | null;
          source_tier: string;
          relevance_score: number;
          impact_category: string;
          urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
          raw_summary?: string | null;
          status?: 'new' | 'mapped' | 'testing' | 'deployed' | 'rejected' | 'archived';
          discovered_at?: string;
        };
        Update: {
          title?: string;
          source_url?: string | null;
          source_tier?: string;
          relevance_score?: number;
          impact_category?: string;
          urgency?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
          raw_summary?: string | null;
          status?: 'new' | 'mapped' | 'testing' | 'deployed' | 'rejected' | 'archived';
        };
      };
      proposals: {
        Row: {
          id: string;
          discovery_id: string | null;
          affected_components: string[];
          current_state: Json;
          proposed_state: Json;
          diff_summary: string;
          risk_scores: Json;
          expected_gains: Json;
          shadow_testable: boolean;
          status: 'pending' | 'in_test' | 'approved' | 'rejected' | 'deployed' | 'rolled_back' | 'undeployable';
          created_at: string;
        };
        Insert: {
          id?: string;
          discovery_id?: string | null;
          affected_components: string[];
          current_state: Json;
          proposed_state: Json;
          diff_summary: string;
          risk_scores: Json;
          expected_gains: Json;
          shadow_testable: boolean;
          status?: 'pending' | 'in_test' | 'approved' | 'rejected' | 'deployed' | 'rolled_back' | 'undeployable';
          created_at?: string;
        };
        Update: {
          discovery_id?: string | null;
          affected_components?: string[];
          current_state?: Json;
          proposed_state?: Json;
          diff_summary?: string;
          risk_scores?: Json;
          expected_gains?: Json;
          shadow_testable?: boolean;
          status?: 'pending' | 'in_test' | 'approved' | 'rejected' | 'deployed' | 'rolled_back' | 'undeployable';
        };
      };
      crucible_tests: {
        Row: {
          id: string;
          proposal_id: string;
          gate_results: Json;
          baseline_metrics: Json;
          test_metrics: Json;
          verdict: 'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'HARD_BLOCK';
          tokens_used: number | null;
          cost_usd: number | null;
          duration_seconds: number | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          gate_results: Json;
          baseline_metrics: Json;
          test_metrics: Json;
          verdict: 'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'HARD_BLOCK';
          tokens_used?: number | null;
          cost_usd?: number | null;
          duration_seconds?: number | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          proposal_id?: string;
          gate_results?: Json;
          baseline_metrics?: Json;
          test_metrics?: Json;
          verdict?: 'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'HARD_BLOCK';
          tokens_used?: number | null;
          cost_usd?: number | null;
          duration_seconds?: number | null;
          completed_at?: string | null;
        };
      };
      prompt_versions: {
        Row: {
          id: string;
          agent_role: string;
          version: string;
          prompt_text: string;
          diff_from_prev: string | null;
          change_rationale: string | null;
          quality_score_before: number | null;
          quality_score_after: number | null;
          is_active: boolean;
          deployed_at: string | null;
          rolled_back_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_role: string;
          version: string;
          prompt_text: string;
          diff_from_prev?: string | null;
          change_rationale?: string | null;
          quality_score_before?: number | null;
          quality_score_after?: number | null;
          is_active?: boolean;
          deployed_at?: string | null;
          rolled_back_at?: string | null;
          created_at?: string;
        };
        Update: {
          agent_role?: string;
          version?: string;
          prompt_text?: string;
          diff_from_prev?: string | null;
          change_rationale?: string | null;
          quality_score_before?: number | null;
          quality_score_after?: number | null;
          is_active?: boolean;
          deployed_at?: string | null;
          rolled_back_at?: string | null;
        };
      };
      deployments: {
        Row: {
          id: string;
          proposal_id: string;
          crucible_test_id: string;
          canary_result: Json | null;
          full_deploy_result: Json | null;
          status: 'canary' | 'deployed' | 'rolled_back' | 'failed';
          rollback_reason: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          crucible_test_id: string;
          canary_result?: Json | null;
          full_deploy_result?: Json | null;
          status: 'canary' | 'deployed' | 'rolled_back' | 'failed';
          rollback_reason?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          proposal_id?: string;
          crucible_test_id?: string;
          canary_result?: Json | null;
          full_deploy_result?: Json | null;
          status?: 'canary' | 'deployed' | 'rolled_back' | 'failed';
          rollback_reason?: string | null;
          completed_at?: string | null;
        };
      };
      weekly_reports: {
        Row: {
          id: string;
          week_start: string;
          discoveries_found: number | null;
          proposals_generated: number | null;
          tests_run: number | null;
          deployments_made: number | null;
          rollbacks: number | null;
          apex_fitness_score: number | null;
          quality_trend: 'improving' | 'stable' | 'degrading' | null;
          cost_of_see_usd: number | null;
          full_report: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          discoveries_found?: number | null;
          proposals_generated?: number | null;
          tests_run?: number | null;
          deployments_made?: number | null;
          rollbacks?: number | null;
          apex_fitness_score?: number | null;
          quality_trend?: 'improving' | 'stable' | 'degrading' | null;
          cost_of_see_usd?: number | null;
          full_report?: string | null;
          created_at?: string;
        };
        Update: {
          week_start?: string;
          discoveries_found?: number | null;
          proposals_generated?: number | null;
          tests_run?: number | null;
          deployments_made?: number | null;
          rollbacks?: number | null;
          apex_fitness_score?: number | null;
          quality_trend?: 'improving' | 'stable' | 'degrading' | null;
          cost_of_see_usd?: number | null;
          full_report?: string | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
