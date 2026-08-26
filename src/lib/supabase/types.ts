// AUTO-GENERATED from the Supabase schema. Do not edit by hand.
// Regenerate after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_artifacts: {
        Row: {
          content: Json
          created_at: string
          grounded_fallback: boolean
          id: string
          is_demo: boolean
          kind: Database["public"]["Enums"]["artifact_kind"]
          latency_ms: number | null
          model: string
          prompt_version: string
          provider: string
          subject_id: string | null
          subject_kind: Database["public"]["Enums"]["artifact_subject"]
          token_usage: Json | null
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          grounded_fallback?: boolean
          id?: string
          is_demo?: boolean
          kind: Database["public"]["Enums"]["artifact_kind"]
          latency_ms?: number | null
          model: string
          prompt_version: string
          provider: string
          subject_id?: string | null
          subject_kind?: Database["public"]["Enums"]["artifact_subject"]
          token_usage?: Json | null
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          grounded_fallback?: boolean
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["artifact_kind"]
          latency_ms?: number | null
          model?: string
          prompt_version?: string
          provider?: string
          subject_id?: string | null
          subject_kind?: Database["public"]["Enums"]["artifact_subject"]
          token_usage?: Json | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          artifact_id: string
          created_at: string
          id: string
          note: string | null
          rating: Database["public"]["Enums"]["feedback_rating"]
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          artifact_id: string
          created_at?: string
          id?: string
          note?: string | null
          rating: Database["public"]["Enums"]["feedback_rating"]
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          artifact_id?: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: Database["public"]["Enums"]["feedback_rating"]
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "ai_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          id: string
          name: string
          occurred_at: string
          props: Json
          user_id: string | null
        }
        Insert: {
          id?: string
          name: string
          occurred_at?: string
          props?: Json
          user_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          occurred_at?: string
          props?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      artifact_sources: {
        Row: {
          artifact_id: string
          commitment_id: string | null
          created_at: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id: string
          interaction_id: string | null
          label: string
          observation_id: string | null
          person_id: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          artifact_id: string
          commitment_id?: string | null
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          interaction_id?: string | null
          label: string
          observation_id?: string | null
          person_id?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          artifact_id?: string
          commitment_id?: string | null
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          interaction_id?: string | null
          label?: string
          observation_id?: string | null
          person_id?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_sources_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "ai_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_sources_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_sources_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_sources_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_sources_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_responses: {
        Row: {
          assessment_id: string
          block_id: string
          created_at: string
          id: string
          latency_ms: number | null
          least_item_id: string
          most_item_id: string
          round_index: number
          user_id: string
        }
        Insert: {
          assessment_id: string
          block_id: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          least_item_id: string
          most_item_id: string
          round_index: number
          user_id: string
        }
        Update: {
          assessment_id?: string
          block_id?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          least_item_id?: string
          most_item_id?: string
          round_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_responses_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          archetype: string | null
          calibration: Database["public"]["Enums"]["calibration_rating"] | null
          calibration_note: string | null
          completed_at: string | null
          consistency: number | null
          coverage: number | null
          created_at: string
          id: string
          instrument_version: string
          narrative: Json | null
          scores: Json
          started_at: string
          status: Database["public"]["Enums"]["assessment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype?: string | null
          calibration?: Database["public"]["Enums"]["calibration_rating"] | null
          calibration_note?: string | null
          completed_at?: string | null
          consistency?: number | null
          coverage?: number | null
          created_at?: string
          id?: string
          instrument_version: string
          narrative?: Json | null
          scores?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype?: string | null
          calibration?: Database["public"]["Enums"]["calibration_rating"] | null
          calibration_note?: string | null
          completed_at?: string | null
          consistency?: number | null
          coverage?: number | null
          created_at?: string
          id?: string
          instrument_version?: string
          narrative?: Json | null
          scores?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string
          due_on: string | null
          id: string
          interaction_id: string | null
          is_demo: boolean
          meeting_id: string | null
          owner: Database["public"]["Enums"]["commitment_owner"]
          owner_person_id: string | null
          person_id: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description: string
          due_on?: string | null
          id?: string
          interaction_id?: string | null
          is_demo?: boolean
          meeting_id?: string | null
          owner?: Database["public"]["Enums"]["commitment_owner"]
          owner_person_id?: string | null
          person_id?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string
          due_on?: string | null
          id?: string
          interaction_id?: string | null
          is_demo?: boolean
          meeting_id?: string | null
          owner?: Database["public"]["Enums"]["commitment_owner"]
          owner_person_id?: string | null
          person_id?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reflections: {
        Row: {
          created_at: string
          id: string
          reflection_date: string
          responses: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reflection_date: string
          responses?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reflection_date?: string
          responses?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entitlement_overrides: {
        Row: {
          capability: string
          created_at: string
          enabled: boolean
          expires_at: string | null
          id: string
          limit_value: number | null
          reason: string | null
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          limit_value?: number | null
          reason?: string | null
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          limit_value?: number | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      external_calendar_events: {
        Row: {
          attendees: Json
          ends_at: string | null
          external_id: string
          id: string
          integration_id: string
          location: string | null
          meeting_id: string | null
          organizer_email: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          starts_at: string
          synced_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          attendees?: Json
          ends_at?: string | null
          external_id: string
          id?: string
          integration_id: string
          location?: string | null
          meeting_id?: string | null
          organizer_email?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          starts_at: string
          synced_at?: string
          title?: string | null
          user_id: string
        }
        Update: {
          attendees?: Json
          ends_at?: string | null
          external_id?: string
          id?: string
          integration_id?: string
          location?: string | null
          meeting_id?: string | null
          organizer_email?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          starts_at?: string
          synced_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_calendar_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_sources: {
        Row: {
          created_at: string
          excerpt: string | null
          fact_id: string
          id: string
          source_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          excerpt?: string | null
          fact_id: string
          id?: string
          source_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          excerpt?: string | null
          fact_id?: string
          id?: string
          source_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_sources_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "professional_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_candidates: {
        Row: {
          confidence: number | null
          created_at: string
          display_name: string
          id: string
          job_title: string | null
          organization: string | null
          person_id: string | null
          profile_url: string | null
          research_job_id: string
          selected: boolean
          signals: Json
          summary: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          display_name: string
          id?: string
          job_title?: string | null
          organization?: string | null
          person_id?: string | null
          profile_url?: string | null
          research_job_id: string
          selected?: boolean
          signals?: Json
          summary?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          display_name?: string
          id?: string
          job_title?: string | null
          organization?: string | null
          person_id?: string | null
          profile_url?: string | null
          research_job_id?: string
          selected?: boolean
          signals?: Json
          summary?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_candidates_research_job_id_fkey"
            columns: ["research_job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          external_account_email: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["integration_status"]
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          external_account_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          external_account_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interaction_participants: {
        Row: {
          created_at: string
          interaction_id: string
          person_id: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          interaction_id: string
          person_id: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          interaction_id?: string
          person_id?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_participants_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          kind: Database["public"]["Enums"]["interaction_kind"]
          meeting_id: string | null
          occurred_at: string
          outcome: string | null
          raw_notes: string | null
          summary: string | null
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          went_well: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["interaction_kind"]
          meeting_id?: string | null
          occurred_at?: string
          outcome?: string | null
          raw_notes?: string | null
          summary?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          went_well?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["interaction_kind"]
          meeting_id?: string | null
          occurred_at?: string
          outcome?: string | null
          raw_notes?: string | null
          summary?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          went_well?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_meeting_fk"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          created_at: string
          meeting_id: string
          person_id: string
          role: Database["public"]["Enums"]["attendee_role"]
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          meeting_id: string
          person_id: string
          role?: Database["public"]["Enums"]["attendee_role"]
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          meeting_id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["attendee_role"]
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          duration_minutes: number | null
          external_event_id: string | null
          external_provider: string | null
          extra_context: string | null
          id: string
          importance: number
          is_demo: boolean
          kind: Database["public"]["Enums"]["meeting_kind"]
          objective: string | null
          scheduled_at: string | null
          stakes: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          external_event_id?: string | null
          external_provider?: string | null
          extra_context?: string | null
          id?: string
          importance?: number
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["meeting_kind"]
          objective?: string | null
          scheduled_at?: string | null
          stakes?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          external_event_id?: string | null
          external_provider?: string | null
          extra_context?: string | null
          id?: string
          importance?: number
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["meeting_kind"]
          objective?: string | null
          scheduled_at?: string | null
          stakes?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          id: string
          interaction_id: string | null
          is_demo: boolean
          meeting_id: string | null
          person_id: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          interaction_id?: string | null
          is_demo?: boolean
          meeting_id?: string | null
          person_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          interaction_id?: string | null
          is_demo?: boolean
          meeting_id?: string | null
          person_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_sources: {
        Row: {
          created_at: string
          excerpt: string | null
          id: string
          interaction_id: string | null
          meeting_id: string | null
          observation_id: string
          source_id: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          excerpt?: string | null
          id?: string
          interaction_id?: string | null
          meeting_id?: string | null
          observation_id: string
          source_id?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          excerpt?: string | null
          id?: string
          interaction_id?: string | null
          meeting_id?: string | null
          observation_id?: string
          source_id?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_sources_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_sources_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_sources_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          category: Database["public"]["Enums"]["observation_category"]
          content: string
          created_at: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          first_seen_at: string
          id: string
          is_demo: boolean
          last_reinforced_at: string
          origin_artifact_id: string | null
          person_id: string
          reinforcement_count: number
          source_kind: Database["public"]["Enums"]["observation_source_kind"]
          status: Database["public"]["Enums"]["observation_status"]
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["observation_category"]
          content: string
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          first_seen_at?: string
          id?: string
          is_demo?: boolean
          last_reinforced_at?: string
          origin_artifact_id?: string | null
          person_id: string
          reinforcement_count?: number
          source_kind?: Database["public"]["Enums"]["observation_source_kind"]
          status?: Database["public"]["Enums"]["observation_status"]
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["observation_category"]
          content?: string
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          first_seen_at?: string
          id?: string
          is_demo?: boolean
          last_reinforced_at?: string
          origin_artifact_id?: string | null
          person_id?: string
          reinforcement_count?: number
          source_kind?: Database["public"]["Enums"]["observation_source_kind"]
          status?: Database["public"]["Enums"]["observation_status"]
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_origin_artifact_fk"
            columns: ["origin_artifact_id"]
            isOneToOne: false
            referencedRelation: "ai_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          is_demo: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          archived_at: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          first_interaction_at: string | null
          footprint_summary: string | null
          full_name: string
          id: string
          identity_locked: boolean
          is_demo: boolean
          job_title: string | null
          last_interaction_at: string | null
          last_researched_at: string | null
          notes: string | null
          organization_id: string | null
          preferred_name: string | null
          profile_url: string | null
          pronouns: string | null
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          relevance: number
          research_status: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_interaction_at?: string | null
          footprint_summary?: string | null
          full_name: string
          id?: string
          identity_locked?: boolean
          is_demo?: boolean
          job_title?: string | null
          last_interaction_at?: string | null
          last_researched_at?: string | null
          notes?: string | null
          organization_id?: string | null
          preferred_name?: string | null
          profile_url?: string | null
          pronouns?: string | null
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          relevance?: number
          research_status?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_interaction_at?: string | null
          footprint_summary?: string | null
          full_name?: string
          id?: string
          identity_locked?: boolean
          is_demo?: boolean
          job_title?: string | null
          last_interaction_at?: string | null
          last_researched_at?: string | null
          notes?: string | null
          organization_id?: string | null
          preferred_name?: string | null
          profile_url?: string | null
          pronouns?: string | null
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          relevance?: number
          research_status?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      person_topics: {
        Row: {
          created_at: string
          person_id: string
          topic_id: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          topic_id: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          topic_id?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_topics_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_topics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_facts: {
        Row: {
          as_of: string | null
          created_at: string
          detail: string | null
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          first_seen_at: string
          has_conflict: boolean
          id: string
          is_current: boolean
          is_demo: boolean
          kind: Database["public"]["Enums"]["fact_kind"]
          last_confirmed_at: string | null
          person_id: string
          superseded_by: string | null
          updated_at: string
          user_id: string
          value: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          as_of?: string | null
          created_at?: string
          detail?: string | null
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          first_seen_at?: string
          has_conflict?: boolean
          id?: string
          is_current?: boolean
          is_demo?: boolean
          kind: Database["public"]["Enums"]["fact_kind"]
          last_confirmed_at?: string | null
          person_id: string
          superseded_by?: string | null
          updated_at?: string
          user_id: string
          value: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          as_of?: string | null
          created_at?: string
          detail?: string | null
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          first_seen_at?: string
          has_conflict?: boolean
          id?: string
          is_current?: boolean
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["fact_kind"]
          last_confirmed_at?: string | null
          person_id?: string
          superseded_by?: string | null
          updated_at?: string
          user_id?: string
          value?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_facts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "professional_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          coaching_context: string[]
          coaching_style: Database["public"]["Enums"]["coaching_style"]
          company: string | null
          created_at: string
          default_workspace_id: string | null
          demo_seeded_at: string | null
          email_notifications: boolean
          full_name: string | null
          id: string
          intents: string[]
          job_function: string | null
          last_seen_at: string | null
          job_title: string | null
          known_frameworks: Json
          onboarding_completed_at: string | null
          onboarding_stage: string
          preferred_name: string | null
          pronouns: string | null
          seniority: string | null
          theme: Database["public"]["Enums"]["theme_preference"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          coaching_context?: string[]
          coaching_style?: Database["public"]["Enums"]["coaching_style"]
          company?: string | null
          created_at?: string
          default_workspace_id?: string | null
          demo_seeded_at?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id: string
          intents?: string[]
          job_function?: string | null
          last_seen_at?: string | null
          job_title?: string | null
          known_frameworks?: Json
          onboarding_completed_at?: string | null
          onboarding_stage?: string
          preferred_name?: string | null
          pronouns?: string | null
          seniority?: string | null
          theme?: Database["public"]["Enums"]["theme_preference"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          coaching_context?: string[]
          coaching_style?: Database["public"]["Enums"]["coaching_style"]
          company?: string | null
          created_at?: string
          default_workspace_id?: string | null
          demo_seeded_at?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id?: string
          intents?: string[]
          job_function?: string | null
          last_seen_at?: string | null
          job_title?: string | null
          known_frameworks?: Json
          onboarding_completed_at?: string | null
          onboarding_stage?: string
          preferred_name?: string | null
          pronouns?: string | null
          seniority?: string | null
          theme?: Database["public"]["Enums"]["theme_preference"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_jobs: {
        Row: {
          completed_at: string | null
          cost_units: number
          created_at: string
          facts_created: number
          failure_reason: string | null
          id: string
          observations_proposed: number
          person_id: string | null
          provider: string | null
          query: Json
          sources_accepted: number
          sources_considered: number
          stage: string | null
          started_at: string
          status: Database["public"]["Enums"]["research_job_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          cost_units?: number
          created_at?: string
          facts_created?: number
          failure_reason?: string | null
          id?: string
          observations_proposed?: number
          person_id?: string | null
          provider?: string | null
          query?: Json
          sources_accepted?: number
          sources_considered?: number
          stage?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["research_job_status"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          cost_units?: number
          created_at?: string
          facts_created?: number
          failure_reason?: string | null
          id?: string
          observations_proposed?: number
          person_id?: string | null
          provider?: string | null
          query?: Json
          sources_accepted?: number
          sources_considered?: number
          stage?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["research_job_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_jobs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          detail: Json
          id: string
          ip_hash: string | null
          kind: string
          occurred_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          detail?: Json
          id?: string
          ip_hash?: string | null
          kind: string
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          detail?: Json
          id?: string
          ip_hash?: string | null
          kind?: string
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      source_person_links: {
        Row: {
          created_at: string
          id: string
          identity_match_confidence: number | null
          identity_match_status: Database["public"]["Enums"]["identity_match_status"]
          match_signals: Json
          person_id: string
          reviewed_by_user: boolean
          source_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          identity_match_confidence?: number | null
          identity_match_status?: Database["public"]["Enums"]["identity_match_status"]
          match_signals?: Json
          person_id: string
          reviewed_by_user?: boolean
          source_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          identity_match_confidence?: number | null
          identity_match_status?: Database["public"]["Enums"]["identity_match_status"]
          match_signals?: Json
          person_id?: string
          reviewed_by_user?: boolean
          source_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_person_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_person_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_person_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          access_status: Database["public"]["Enums"]["source_access_status"]
          author: string | null
          content_hash: string | null
          created_at: string
          excerpt: string | null
          extracted_text: string | null
          failure_reason: string | null
          id: string
          is_demo: boolean
          metadata: Json
          processing_status: Database["public"]["Enums"]["source_processing_status"]
          published_at: string | null
          publisher: string | null
          retrieved_at: string | null
          source_title: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          access_status?: Database["public"]["Enums"]["source_access_status"]
          author?: string | null
          content_hash?: string | null
          created_at?: string
          excerpt?: string | null
          extracted_text?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          metadata?: Json
          processing_status?: Database["public"]["Enums"]["source_processing_status"]
          published_at?: string | null
          publisher?: string | null
          retrieved_at?: string | null
          source_title?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          access_status?: Database["public"]["Enums"]["source_access_status"]
          author?: string | null
          content_hash?: string | null
          created_at?: string
          excerpt?: string | null
          extracted_text?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          metadata?: Json
          processing_status?: Database["public"]["Enums"]["source_processing_status"]
          published_at?: string | null
          publisher?: string | null
          retrieved_at?: string | null
          source_title?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          founding_number: number | null
          is_founding: boolean
          plan: Database["public"]["Enums"]["plan_tier"]
          price_protected_until: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          founding_number?: number | null
          is_founding?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
          price_protected_until?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          founding_number?: number | null
          is_founding?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
          price_protected_until?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          label: string
          user_id: string
          visibility: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          label: string
          user_id: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          label?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["record_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["usage_kind"]
          occurred_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["usage_kind"]
          occurred_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["usage_kind"]
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_meters: {
        Row: {
          cost_units: number
          id: string
          input_tokens: number | null
          estimated_cost_micros?: number
          search_requests?: number
          kind: Database["public"]["Enums"]["meter_kind"]
          model: string | null
          occurred_at: string
          output_tokens: number | null
          period_start: string
          provider: string | null
          quantity: number
          subject_id: string | null
          subject_kind: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          cost_units?: number
          id?: string
          input_tokens?: number | null
          estimated_cost_micros?: number
          search_requests?: number
          kind: Database["public"]["Enums"]["meter_kind"]
          model?: string | null
          occurred_at?: string
          output_tokens?: number | null
          period_start: string
          provider?: string | null
          quantity?: number
          subject_id?: string | null
          subject_kind?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          cost_units?: number
          id?: string
          input_tokens?: number | null
          estimated_cost_micros?: number
          search_requests?: number
          kind?: Database["public"]["Enums"]["meter_kind"]
          model?: string | null
          occurred_at?: string
          output_tokens?: number | null
          period_start?: string
          provider?: string | null
          quantity?: number
          subject_id?: string | null
          subject_kind?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_meters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reflections: {
        Row: {
          artifact_id: string | null
          created_at: string
          id: string
          user_id: string
          week_start: string
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string
          id?: string
          user_id: string
          week_start: string
        }
        Update: {
          artifact_id?: string | null
          created_at?: string
          id?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reflections_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "ai_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_demo_data: { Args: never; Returns: undefined }
      delete_my_data: { Args: never; Returns: undefined }
      ensure_personal_workspace: {
        Args: { display_name: string; target_user: string }
        Returns: string
      }
      relationship_pulse: {
        Args: { target_person: string }
        Returns: {
          days_since_contact: number
          has_upcoming: boolean
          interaction_count: number
          open_commitments: number
          overdue_commitments: number
          score: number
        }[]
      }
      search_everything: {
        Args: { max_results?: number; q: string }
        Returns: {
          entity: string
          id: string
          occurred_at: string
          person_id: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      usage_in_period: {
        Args: {
          period: string
          target_kind: Database["public"]["Enums"]["meter_kind"]
        }
        Returns: number
      }
    }
    Enums: {
      artifact_kind:
        | "meeting_brief"
        | "quick_brief"
        | "debrief"
        | "relationship_summary"
        | "message_adaptation"
        | "daily_focus"
        | "weekly_reflection"
        | "coach_message"
        | "memory_proposal"
        | "profile_narrative"
      artifact_subject: "person" | "meeting" | "interaction" | "user" | "none"
      assessment_status: "in_progress" | "completed" | "abandoned"
      attendee_role:
        | "decision_maker"
        | "influencer"
        | "contributor"
        | "informed"
        | "presenter"
        | "other"
      calibration_rating:
        | "very_accurate"
        | "mostly_accurate"
        | "partly_accurate"
        | "not_accurate"
      coaching_style:
        | "concise"
        | "balanced"
        | "detailed"
        | "challenging"
        | "supportive"
      commitment_owner: "user" | "person" | "shared"
      commitment_status: "open" | "done" | "dropped"
      evidence_level: "confirmed" | "observed" | "inferred" | "unknown"
      fact_kind:
        | "current_role"
        | "current_organization"
        | "prior_role"
        | "education"
        | "expertise"
        | "theme"
        | "publication"
        | "appearance"
        | "location"
        | "communication_signal"
        | "other"
      feedback_rating: "yes" | "partly" | "no"
      identity_match_status:
        | "confirmed"
        | "probable"
        | "ambiguous"
        | "no_match"
        | "conflicting"
        | "unreviewed"
      integration_provider: "google" | "microsoft"
      integration_status: "connected" | "expired" | "revoked" | "error"
      interaction_kind:
        | "meeting"
        | "call"
        | "email"
        | "message"
        | "informal"
        | "other"
      meeting_kind:
        | "one_on_one"
        | "executive_review"
        | "project_review"
        | "customer_meeting"
        | "sales_conversation"
        | "negotiation"
        | "difficult_conversation"
        | "feedback_conversation"
        | "performance_conversation"
        | "interview"
        | "networking"
        | "presentation"
        | "vendor_discussion"
        | "team_meeting"
        | "other"
      meeting_status: "upcoming" | "completed" | "cancelled"
      meter_kind:
        | "person_research"
        | "deep_research"
        | "meeting_brief"
        | "quick_brief"
        | "transcript_analysis"
        | "document_analysis"
        | "ai_coach_message"
        | "message_adaptation"
        | "source_ingest"
      observation_category:
        | "communication"
        | "decision"
        | "trust"
        | "friction"
        | "priority"
        | "preference"
        | "context"
        | "other"
      observation_source_kind:
        | "user"
        | "debrief"
        | "interaction"
        | "ai_inference"
        | "import"
      observation_status: "proposed" | "active" | "dismissed"
      plan_tier: "free" | "pro" | "team"
      record_visibility: "private" | "shared"
      relationship_type:
        | "manager"
        | "report"
        | "skip_level"
        | "peer"
        | "cross_functional"
        | "customer"
        | "prospect"
        | "vendor"
        | "partner"
        | "candidate"
        | "mentor"
        | "external"
        | "other"
      research_job_status:
        | "queued"
        | "running"
        | "complete"
        | "failed"
        | "cancelled"
        | "no_results"
      source_access_status:
        | "analyzed"
        | "limited_access"
        | "login_required"
        | "paywall"
        | "content_unavailable"
        | "identity_uncertain"
        | "unsupported"
        | "error"
        | "pending"
      source_processing_status:
        | "pending"
        | "fetching"
        | "extracting"
        | "complete"
        | "failed"
      source_type:
        | "public_web"
        | "user_url"
        | "user_note"
        | "user_pasted_text"
        | "document"
        | "pdf"
        | "transcript"
        | "calendar"
        | "email"
        | "contact"
        | "crm"
        | "company_bio"
        | "conference"
        | "article"
        | "podcast"
        | "video"
        | "github"
        | "social_public"
        | "licensed_enrichment"
        | "other"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      theme_preference: "pearl" | "obsidian" | "system"
      usage_kind:
        | "meeting_brief"
        | "coach_message"
        | "message_adaptation"
        | "debrief"
        | "person_created"
      workspace_kind: "personal" | "team" | "enterprise"
      workspace_role: "owner" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      artifact_kind: [
        "meeting_brief",
        "quick_brief",
        "debrief",
        "relationship_summary",
        "message_adaptation",
        "daily_focus",
        "weekly_reflection",
        "coach_message",
        "memory_proposal",
        "profile_narrative",
      ],
      artifact_subject: ["person", "meeting", "interaction", "user", "none"],
      assessment_status: ["in_progress", "completed", "abandoned"],
      attendee_role: [
        "decision_maker",
        "influencer",
        "contributor",
        "informed",
        "presenter",
        "other",
      ],
      calibration_rating: [
        "very_accurate",
        "mostly_accurate",
        "partly_accurate",
        "not_accurate",
      ],
      coaching_style: [
        "concise",
        "balanced",
        "detailed",
        "challenging",
        "supportive",
      ],
      commitment_owner: ["user", "person", "shared"],
      commitment_status: ["open", "done", "dropped"],
      evidence_level: ["confirmed", "observed", "inferred", "unknown"],
      fact_kind: [
        "current_role",
        "current_organization",
        "prior_role",
        "education",
        "expertise",
        "theme",
        "publication",
        "appearance",
        "location",
        "communication_signal",
        "other",
      ],
      feedback_rating: ["yes", "partly", "no"],
      identity_match_status: [
        "confirmed",
        "probable",
        "ambiguous",
        "no_match",
        "conflicting",
        "unreviewed",
      ],
      integration_provider: ["google", "microsoft"],
      integration_status: ["connected", "expired", "revoked", "error"],
      interaction_kind: [
        "meeting",
        "call",
        "email",
        "message",
        "informal",
        "other",
      ],
      meeting_kind: [
        "one_on_one",
        "executive_review",
        "project_review",
        "customer_meeting",
        "sales_conversation",
        "negotiation",
        "difficult_conversation",
        "feedback_conversation",
        "performance_conversation",
        "interview",
        "networking",
        "presentation",
        "vendor_discussion",
        "team_meeting",
        "other",
      ],
      meeting_status: ["upcoming", "completed", "cancelled"],
      meter_kind: [
        "person_research",
        "deep_research",
        "meeting_brief",
        "quick_brief",
        "transcript_analysis",
        "document_analysis",
        "ai_coach_message",
        "message_adaptation",
        "source_ingest",
      ],
      observation_category: [
        "communication",
        "decision",
        "trust",
        "friction",
        "priority",
        "preference",
        "context",
        "other",
      ],
      observation_source_kind: [
        "user",
        "debrief",
        "interaction",
        "ai_inference",
        "import",
      ],
      observation_status: ["proposed", "active", "dismissed"],
      plan_tier: ["free", "pro", "team"],
      record_visibility: ["private", "shared"],
      relationship_type: [
        "manager",
        "report",
        "skip_level",
        "peer",
        "cross_functional",
        "customer",
        "prospect",
        "vendor",
        "partner",
        "candidate",
        "mentor",
        "external",
        "other",
      ],
      research_job_status: [
        "queued",
        "running",
        "complete",
        "failed",
        "cancelled",
        "no_results",
      ],
      source_access_status: [
        "analyzed",
        "limited_access",
        "login_required",
        "paywall",
        "content_unavailable",
        "identity_uncertain",
        "unsupported",
        "error",
        "pending",
      ],
      source_processing_status: [
        "pending",
        "fetching",
        "extracting",
        "complete",
        "failed",
      ],
      source_type: [
        "public_web",
        "user_url",
        "user_note",
        "user_pasted_text",
        "document",
        "pdf",
        "transcript",
        "calendar",
        "email",
        "contact",
        "crm",
        "company_bio",
        "conference",
        "article",
        "podcast",
        "video",
        "github",
        "social_public",
        "licensed_enrichment",
        "other",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      theme_preference: ["pearl", "obsidian", "system"],
      usage_kind: [
        "meeting_brief",
        "coach_message",
        "message_adaptation",
        "debrief",
        "person_created",
      ],
      workspace_kind: ["personal", "team", "enterprise"],
      workspace_role: ["owner", "admin", "member"],
    },
  },
} as const
