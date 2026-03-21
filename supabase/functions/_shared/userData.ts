/**
 * Unified shape for assembled user data from various connectors.
 * This is the input format for the Deterministic Planner.
 */
export interface AssembledUserData {
  calendar_events?: Array<{
    source_id: string;
    title: string;
    start_time_iso: string;
    end_time_iso: string;
    location?: string;
    meeting_link?: string;
  }>;
  emails_unread?: Array<{
    source_id: string;
    from_display: string;
    subject: string;
    snippet: string;
    received_time_iso: string;
    email_id: string;
    thread_id: string;
  }>;
  github_prs?: Array<{
    source_id: string;
    repo: string;
    title: string;
    url: string;
    author_display: string;
    status: string;
    updated_time_iso: string;
  }>;
  jira_tasks?: Array<{
    source_id: string;
    key: string;
    title: string;
    status: string;
    priority: string;
    url: string;
  }>;
  news_items?: Array<{
    source_id: string;
    title: string;
    source_name: string;
    url: string;
    published_time_iso: string;
    snippet: string;
    tags?: string[];
  }>;
  weather?: Array<{
    source_id: string;
    location_display: string;
    summary: string;
    temp_c: number;
    precip_probability_pct: number;
  }>;
}
