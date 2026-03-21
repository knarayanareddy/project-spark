import { AssembledUserData } from "./userData.ts";

export interface SegmentPlan {
  plan_id: string;
  segment_kind: "weather" | "calendar_event" | "email" | "github_pr" | "jira_task" | "news_item" | "wrap";
  title: string;
  facts: any;
  grounding_source_ids: string[];
  ui_action_suggestion: {
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
        card_type: "weather_widget",
        title: `${w.location_display}: ${w.temp_c}°C`,
        action_button_text: "View Forecast",
        action_payload: "#",
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
          card_type: "calendar_join",
          title: ev.title,
          action_button_text: ev.meeting_link ? "Join Call" : "View Event",
          action_payload: ev.meeting_link || "#",
        },
        b_roll_hint: "Professional modern boardroom, conference table setup",
      });
    });
  }

  // 3. News Items (Highly Ranked Delta)
  if (userData.news_items) {
    userData.news_items.slice(0, CAPS.news_item).forEach((news) => {
      plans.push({
        plan_id: `news_${news.source_id}`,
        segment_kind: "news_item",
        title: "AI Development Update",
        facts: news,
        grounding_source_ids: [news.source_id],
        ui_action_suggestion: {
          card_type: "link_open",
          title: news.title.slice(0, 40),
          action_button_text: "Read Article",
          action_payload: news.url,
        },
        b_roll_hint: `Futuristic news visual related to ${news.title.slice(0, 30)}, digital interface`,
      });
    });
  }

  // 4. GitHub PRs
  if (userData.github_prs) {
    userData.github_prs.slice(0, CAPS.github_pr).forEach((pr) => {
      plans.push({
        plan_id: `gh_${pr.source_id}`,
        segment_kind: "github_pr",
        title: "GitHub Activity",
        facts: pr,
        grounding_source_ids: [pr.source_id],
        ui_action_suggestion: {
          card_type: "github_review",
          title: `${pr.repo}: ${pr.title.slice(0, 30)}`,
          action_button_text: "Review PR",
          action_payload: pr.url,
        },
        b_roll_hint: `Code review on a dark themed IDE, GitHub logo in background`,
      });
    });
  }

  // 5. Wrap / Closing
  if (plans.length > 0) {
    plans.push({
      plan_id: "wrap_segment",
      segment_kind: "wrap",
      title: "Briefing Summary",
      facts: { summary: "End of morning briefing. Have a productive day." },
      grounding_source_ids: ["system_summary"],
      ui_action_suggestion: {
        card_type: "link_open",
        title: "Briefing Complete",
        action_button_text: "Done",
        action_payload: "#",
      },
      b_roll_hint: "Sunrise over a modern city skyline, high-resolution bokeh",
    });
  }

  return plans;
}
