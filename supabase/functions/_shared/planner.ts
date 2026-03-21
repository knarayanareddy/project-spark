import { AssembledUserData } from "./userData.ts";

export interface SegmentPlan {
  plan_id: string;
  segment_kind: "weather" | "calendar_event" | "email" | "github_pr" | "jira_task" | "news_item" | "wrap" | "news_digest" | "github_digest" | "email_digest";
  title: string;
  facts: any;
  grounding_source_ids: string[];
  ui_action_suggestion: {
    is_active: boolean;
    card_type: string;
    title: string;
    action_button_text: string;
    action_payload: string;
  };
  b_roll_hint: string | null;
}

const CAPS = {
  weather: 1,
  calendar_event: 3,
  email: 3,
  github_pr: 2,
  jira_task: 3,
  news_item: 3,
};

/**
 * Deterministic planner that converts assembled user data into a sequence of segment plans.
 * No LLM involved in this stage to ensure stability and zero hallucination.
 */
export function planBriefing(userData: AssembledUserData): SegmentPlan[] {
  const plans: SegmentPlan[] = [];

  // 1. Weather
  if (userData.weather && userData.weather.length > 0) {
    const w = userData.weather[0];
    plans.push({
      plan_id: `weather_${w.source_id}`,
      segment_kind: "weather",
      title: "Local Weather Update",
      facts: w,
      grounding_source_ids: [w.source_id],
      ui_action_suggestion: {
        is_active: false,
        card_type: "weather_widget",
        title: `${w.location_display}: ${w.temp_c}°C`,
        action_button_text: "",
        action_payload: "",
      },
      b_roll_hint: `Panoramic view of ${w.location_display}, ${w.summary} conditions`,
    });
  }

  // 2. Calendar
  if (userData.calendar_events) {
    userData.calendar_events.slice(0, CAPS.calendar_event).forEach((ev) => {
      plans.push({
        plan_id: `cal_${ev.source_id}`,
        segment_kind: "calendar_event",
        title: "Upcoming Meeting",
        facts: ev,
        grounding_source_ids: [ev.source_id],
        ui_action_suggestion: {
          is_active: !!ev.meeting_link,
          card_type: "calendar_join",
          title: ev.title,
          action_button_text: ev.meeting_link ? "Join Call" : "",
          action_payload: ev.meeting_link || "",
        },
        b_roll_hint: null,
      });
    });
  }

  // 3. News Items (Highly Ranked Delta)
  if (userData.news_items && userData.news_items.length > 0) {
    const topIds = userData.news_items.slice(0, 3).map((n: any) => n.source_id);
    
    // Digest
    plans.push({
      plan_id: `news_digest_${topIds[0]}`,
      segment_kind: "news_digest",
      title: "Top AI News Abstract",
      facts: { 
        count: userData.news_items.length, 
        top_headlines: userData.news_items.slice(0, 3).map((n: any) => n.title) 
      },
      grounding_source_ids: topIds,
      ui_action_suggestion: {
        is_active: false,
        card_type: "link_open",
        title: "",
        action_button_text: "",
        action_payload: "",
      },
      b_roll_hint: `Abstract fast-paced digital news network visualization`,
    });

    // Individual Items
    userData.news_items.slice(0, CAPS.news_item).forEach((news: any, idx: number) => {
      plans.push({
        plan_id: `news_${news.source_id}`,
        segment_kind: "news_item",
        title: "News Deep Dive",
        facts: news,
        grounding_source_ids: [news.source_id],
        ui_action_suggestion: {
          is_active: !!news.url,
          card_type: "link_open",
          title: news.title.slice(0, 40),
          action_button_text: news.url ? "Read Article" : "",
          action_payload: news.url || "",
        },
        b_roll_hint: idx === 0 ? `Futuristic news visual related to ${news.title.slice(0, 30)}, digital interface` : null,
      });
    });
  }

  // 4. GitHub PRs
  if (userData.github_prs && userData.github_prs.length > 0) {
    const topGhIds = userData.github_prs.slice(0, CAPS.github_pr).map((pr: any) => pr.source_id);
    
    // GH Digest
    plans.push({
      plan_id: `gh_digest_${topGhIds[0]}`,
      segment_kind: "github_digest",
      title: "GitHub Overview",
      facts: {
        count: userData.github_prs.length,
        top_repos: [...new Set(userData.github_prs.map((pr: any) => pr.repo))],
      },
      grounding_source_ids: topGhIds,
      ui_action_suggestion: {
        is_active: false,
        card_type: "github_review",
        title: "",
        action_button_text: "",
        action_payload: "",
      },
      b_roll_hint: `Code review on a dark themed IDE, abstract data flows, GitHub logo in background`,
    });

    // Individual Items
    userData.github_prs.slice(0, CAPS.github_pr).forEach((pr: any) => {
      plans.push({
        plan_id: `gh_${pr.source_id}`,
        segment_kind: "github_pr",
        title: "PR Review",
        facts: pr,
        grounding_source_ids: [pr.source_id],
        ui_action_suggestion: {
          is_active: !!pr.url,
          card_type: "github_review",
          title: `${pr.repo}: ${pr.title.slice(0, 30)}`,
          action_button_text: pr.url ? "Review PR" : "",
          action_payload: pr.url || "",
        },
        b_roll_hint: null,
      });
    });
  }

  // 5. Wrap / Closing
  if (plans.length > 0) {
    const usedIds = new Set<string>();
    for (const p of plans) {
      for (const gid of p.grounding_source_ids) {
        usedIds.add(gid);
        if (usedIds.size >= 5) break;
      }
      if (usedIds.size >= 5) break;
    }
    const wrapGrounding = Array.from(usedIds);

    plans.push({
      plan_id: "wrap_segment",
      segment_kind: "wrap",
      title: "Briefing Summary",
      facts: { summary: "End of morning briefing. Have a productive day." },
      grounding_source_ids: wrapGrounding,
      ui_action_suggestion: {
        is_active: false,
        card_type: "link_open",
        title: "",
        action_button_text: "",
        action_payload: "",
      },
      b_roll_hint: null,
    });
  }

  return plans;
}
