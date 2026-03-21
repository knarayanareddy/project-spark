import { AssembledUserData } from "./userData.ts";
import { MODULE_CATALOG, ModuleId } from "./moduleCatalog.ts";

export type SegmentKind =
  | "weather"
  | "calendar_event"
  | "news_digest"
  | "news_item"
  | "github_digest"
  | "github_pr"
  | "email_digest"
  | "email_item"
  | "focus_plan"
  | "connector_missing"
  | "wrap";

export interface SegmentPlan {
  plan_id: string;
  segment_kind: SegmentKind;
  title: string;
  facts: Record<string, any>;
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

/** Resolve the effective cap for a module, respecting profile overrides. */
function resolveCap(moduleId: ModuleId, moduleSettings: Record<string, any>): number {
  const override = moduleSettings[moduleId]?.caps;
  if (typeof override === "number" && Number.isInteger(override) && override > 0) return override;
  return MODULE_CATALOG[moduleId]?.defaultSettings?.caps ?? 3;
}

/** Build a disabled action card with no payload — never "#". */
const INACTIVE_ACTION = (cardType: string): SegmentPlan["ui_action_suggestion"] => ({
  is_active: false,
  card_type: cardType,
  title: "",
  action_button_text: "",
  action_payload: "",
});

export interface PlannerInput {
  enabledModules: ModuleId[];
  moduleSettings: Record<string, any>;
  userData: AssembledUserData;
}

/**
 * Fully deterministic module-driven planner.
 * No LLM. No invented facts. No "#" payloads.
 * Returns [] if there is nothing to brief.
 */
export function planSegments({ enabledModules, moduleSettings, userData }: PlannerInput): SegmentPlan[] {
  const plans: SegmentPlan[] = [];
  // Track all source_ids actually used so wrap can reference them
  const allGroundingIds: string[] = [];

  const emit = (plan: SegmentPlan) => {
    plans.push(plan);
    plan.grounding_source_ids.forEach(id => allGroundingIds.push(id));
  };

  // ── 1. WEATHER ─────────────────────────────────────────────────────────────
  if (enabledModules.includes("weather") && userData.weather && userData.weather.length > 0) {
    const w = userData.weather[0];
    emit({
      plan_id: `weather_${w.source_id}`,
      segment_kind: "weather",
      title: "Local Weather Update",
      facts: { location: w.location_display, summary: w.summary, temp_c: w.temp_c, precip_pct: w.precip_probability_pct },
      grounding_source_ids: [w.source_id],
      ui_action_suggestion: {
        is_active: true,
        card_type: "weather_widget",
        title: `${w.location_display}: ${w.temp_c}°C`,
        action_button_text: "View Forecast",
        action_payload: `https://wttr.in/${encodeURIComponent(w.location_display)}`,
      },
      b_roll_hint: `Panoramic aerial of ${w.location_display}, ${w.summary} conditions`,
    });
  }

  // ── 2. CALENDAR ────────────────────────────────────────────────────────────
  if (enabledModules.includes("calendar_today") && userData.calendar_events && userData.calendar_events.length > 0) {
    const cap = resolveCap("calendar_today", moduleSettings);
    userData.calendar_events.slice(0, cap).forEach(ev => {
      emit({
        plan_id: `cal_${ev.source_id}`,
        segment_kind: "calendar_event",
        title: "Upcoming Meeting",
        facts: { title: ev.title, start: ev.start_time_iso, end: ev.end_time_iso, location: ev.location || null },
        grounding_source_ids: [ev.source_id],
        ui_action_suggestion: ev.meeting_link
          ? { is_active: true, card_type: "calendar_join", title: ev.title, action_button_text: "Join Call", action_payload: ev.meeting_link }
          : INACTIVE_ACTION("calendar_join"),
        b_roll_hint: null,
      });
    });
  }

  // ── 3. AI NEWS ─────────────────────────────────────────────────────────────
  if (enabledModules.includes("ai_news_delta") && userData.news_items && userData.news_items.length > 0) {
    const cap = resolveCap("ai_news_delta", moduleSettings);
    const topNews = userData.news_items.slice(0, cap);
    const topIds = topNews.map(n => n.source_id);

    // Digest
    emit({
      plan_id: `news_digest_${topIds[0]}`,
      segment_kind: "news_digest",
      title: "AI & Tech News Digest",
      facts: {
        count: topNews.length,
        headlines: topNews.map(n => n.title),
      },
      grounding_source_ids: topIds,
      ui_action_suggestion: INACTIVE_ACTION("link_open"),
      b_roll_hint: "Fast-paced digital news network, glowing headlines, abstract data stream",
    });

    // Individual items
    topNews.forEach((news, idx) => {
      emit({
        plan_id: `news_${news.source_id}`,
        segment_kind: "news_item",
        title: news.title,
        facts: { title: news.title, source: news.source_name, snippet: news.snippet, url: news.url, published: news.published_time_iso },
        grounding_source_ids: [news.source_id],
        ui_action_suggestion: news.url
          ? { is_active: true, card_type: "link_open", title: news.title.slice(0, 50), action_button_text: "Read Article", action_payload: news.url }
          : INACTIVE_ACTION("link_open"),
        b_roll_hint: idx === 0 ? `Futuristic visual representing: ${news.title.slice(0, 40)}` : null,
      });
    });
  }

  // ── 4. GITHUB PRs ──────────────────────────────────────────────────────────
  if (enabledModules.includes("github_prs") && userData.github_prs && userData.github_prs.length > 0) {
    const cap = resolveCap("github_prs", moduleSettings);
    const topPRs = userData.github_prs.slice(0, cap);
    const topIds = topPRs.map(pr => pr.source_id);

    // Digest
    emit({
      plan_id: `gh_digest_${topIds[0]}`,
      segment_kind: "github_digest",
      title: "GitHub Pull Request Overview",
      facts: {
        count: topPRs.length,
        repos: [...new Set(topPRs.map(pr => pr.repo))],
      },
      grounding_source_ids: topIds,
      ui_action_suggestion: INACTIVE_ACTION("github_review"),
      b_roll_hint: "Dark-themed IDE with glowing code, abstract data flows",
    });

    // Individual PRs
    topPRs.forEach(pr => {
      emit({
        plan_id: `gh_${pr.source_id}`,
        segment_kind: "github_pr",
        title: `PR Review: ${pr.title.slice(0, 50)}`,
        facts: { repo: pr.repo, title: pr.title, author: pr.author_display, status: pr.status, url: pr.url },
        grounding_source_ids: [pr.source_id],
        ui_action_suggestion: pr.url
          ? { is_active: true, card_type: "github_review", title: `${pr.repo}: ${pr.title.slice(0, 30)}`, action_button_text: "Review PR", action_payload: pr.url }
          : INACTIVE_ACTION("github_review"),
        b_roll_hint: null,
      });
    });
  }

  // Connector missing segment — github requested but not connected
  if (enabledModules.includes("github_prs") && userData.connector_status) {
    const ghStatus = userData.connector_status.find(c => c.provider === "github");
    if (ghStatus && !ghStatus.connected) {
      emit({
        plan_id: `connector_missing_github`,
        segment_kind: "connector_missing",
        title: "GitHub Not Connected",
        facts: { message: ghStatus.message, provider: ghStatus.provider },
        grounding_source_ids: [ghStatus.source_id],
        ui_action_suggestion: INACTIVE_ACTION("link_open"),
        b_roll_hint: null,
      });
    }
  }

  // ── 5. EMAIL / INBOX TRIAGE ────────────────────────────────────────────────
  if (enabledModules.includes("inbox_triage") && userData.emails_unread && userData.emails_unread.length > 0) {
    const cap = resolveCap("inbox_triage", moduleSettings);
    const topEmails = userData.emails_unread.slice(0, cap);
    const topIds = topEmails.map(e => e.source_id);

    // Digest
    emit({
      plan_id: `email_digest_${topIds[0]}`,
      segment_kind: "email_digest",
      title: "Inbox Highlights",
      facts: { count: topEmails.length, senders: topEmails.map(e => e.from_display) },
      grounding_source_ids: topIds,
      ui_action_suggestion: INACTIVE_ACTION("email_reply"),
      b_roll_hint: null,
    });

    // Individual emails
    topEmails.forEach(email => {
      emit({
        plan_id: `email_${email.source_id}`,
        segment_kind: "email_item",
        title: email.subject,
        facts: { from: email.from_display, subject: email.subject, snippet: email.snippet },
        grounding_source_ids: [email.source_id],
        ui_action_suggestion: email.thread_id
          ? {
              is_active: true,
              card_type: "email_reply",
              title: `From: ${email.from_display}`,
              action_button_text: "Open Email",
              action_payload: `https://mail.google.com/mail/u/0/#inbox/${email.thread_id}`,
            }
          : INACTIVE_ACTION("email_reply"),
        b_roll_hint: null,
      });
    });
  }

  // ── 6. FOCUS PLAN ──────────────────────────────────────────────────────────
  if (enabledModules.includes("focus_plan")) {
    // Only emit if we have real actionable items from earlier plans
    const actionableItems = plans
      .filter(p => p.ui_action_suggestion.is_active)
      .slice(0, 3);

    if (actionableItems.length > 0) {
      const focusIds = actionableItems.flatMap(p => p.grounding_source_ids).slice(0, 3);
      emit({
        plan_id: "focus_plan_segment",
        segment_kind: "focus_plan",
        title: "Today's Top Actions",
        facts: {
          action_count: actionableItems.length,
          top_actions: actionableItems.map(p => p.title),
        },
        grounding_source_ids: focusIds,
        ui_action_suggestion: INACTIVE_ACTION("link_open"),
        b_roll_hint: null,
      });
    }
  }

  // ── 7. WRAP ────────────────────────────────────────────────────────────────
  if (plans.length > 0) {
    // Real source_ids only — deduplicated, max 5
    const wrapGrounding = [...new Set(allGroundingIds)].slice(0, 5);
    emit({
      plan_id: "wrap_segment",
      segment_kind: "wrap",
      title: "Briefing Complete",
      facts: { total_segments: plans.length },
      grounding_source_ids: wrapGrounding,
      ui_action_suggestion: INACTIVE_ACTION("link_open"),
      b_roll_hint: null,
    });
  }

  return plans;
}

// Backwards-compat alias so existing callers still work
export function planBriefing(userData: AssembledUserData): SegmentPlan[] {
  const enabledModules: ModuleId[] = ["weather", "ai_news_delta", "github_prs", "calendar_today", "inbox_triage"];
  return planSegments({ enabledModules, moduleSettings: {}, userData });
}
