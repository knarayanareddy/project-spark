export const mockUserPreferences = {
  persona: "Tech Executive",
  briefing_style: "concise",
  voice_tone: "professional yet approachable",
  preferred_segments: [
    "calendar_overview",
    "email_highlights",
    "project_updates",
    "weather",
    "hackathon_schedule",
  ],
  timezone: "America/Los_Angeles",
};

export const mockUserData = {
  date: "2026-03-21",
  calendar_events: [
    {
      id: "evt-001",
      title: "Hackathon Kickoff & Team Formation",
      start: "2026-03-21T09:00:00-07:00",
      end: "2026-03-21T10:00:00-07:00",
      location: "Main Stage, Moscone Center",
      join_url: "https://meet.example.com/hackathon-kickoff",
    },
    {
      id: "evt-002",
      title: "API Workshop: Building with AI Avatars",
      start: "2026-03-21T11:00:00-07:00",
      end: "2026-03-21T12:00:00-07:00",
      location: "Workshop Room B",
      join_url: "https://meet.example.com/api-workshop",
    },
    {
      id: "evt-003",
      title: "Midpoint Check-in with Mentors",
      start: "2026-03-21T15:00:00-07:00",
      end: "2026-03-21T15:30:00-07:00",
      location: "Mentor Lounge",
      join_url: null,
    },
    {
      id: "evt-004",
      title: "Demo Submissions Due",
      start: "2026-03-22T12:00:00-07:00",
      end: "2026-03-22T12:00:00-07:00",
      location: "Online Portal",
      join_url: "https://hackathon.example.com/submit",
    },
    {
      id: "evt-005",
      title: "Final Demos & Judging",
      start: "2026-03-22T14:00:00-07:00",
      end: "2026-03-22T16:00:00-07:00",
      location: "Main Stage, Moscone Center",
      join_url: "https://meet.example.com/final-demos",
    },
  ],
  emails: [
    {
      id: "email-001",
      from: "sarah@hackathon.org",
      subject: "Hackathon Venue Map & WiFi Details",
      snippet:
        "Here's the venue map for tomorrow. WiFi: HackNet2026 / password: BuildFast!",
      priority: "high",
      reply_action: "mailto:sarah@hackathon.org?subject=Re:Venue+Map",
    },
    {
      id: "email-002",
      from: "cto@mycompany.com",
      subject: "Q1 Board Deck - Final Review Needed",
      snippet:
        "Please review slides 12-18 on AI strategy before Monday's board meeting.",
      priority: "medium",
      reply_action: "mailto:cto@mycompany.com?subject=Re:Q1+Board+Deck",
    },
  ],
  project_updates: [
    {
      source: "jira",
      id: "PROJ-1234",
      title: "Avatar pipeline latency > 30s",
      status: "In Progress",
      assignee: "You",
      url: "https://jira.example.com/browse/PROJ-1234",
    },
    {
      source: "github",
      id: "PR-89",
      title: "feat: add streaming response to briefing endpoint",
      status: "Review Requested",
      author: "alex-dev",
      url: "https://github.com/example/repo/pull/89",
    },
  ],
  weather: {
    location: "San Francisco, CA",
    temp_f: 62,
    condition: "Partly Cloudy",
    high_f: 67,
    low_f: 55,
    summary: "Pleasant day, light breeze. No rain expected.",
  },
  venue_map_url: "https://hackathon.example.com/venue-map",
};

// Mock script JSON that would come back from the LLM
export const mockScriptJson = {
  briefing_metadata: {
    generated_at: "2026-03-21T07:00:00-07:00",
    persona: "Tech Executive",
    total_estimated_segments: 6,
  },
  timeline: [
    {
      segment_id: 1,
      segment_type: "greeting",
      dialogue:
        "Good morning! It's Friday, March 21st, 2026. You've got a packed day at the hackathon. Let me walk you through everything you need to know.",
      grounding_source_id: "system",
      runware_b_roll_prompt: "Modern tech conference venue at sunrise, sleek glass building, warm golden light, cinematic",
      ui_action_card: { is_active: false },
    },
    {
      segment_id: 2,
      segment_type: "calendar_overview",
      dialogue:
        "Your hackathon day starts with the Kickoff and Team Formation at 9 AM on the Main Stage. At 11, there's an API Workshop on Building with AI Avatars — that's directly relevant to your project. Then a Midpoint Check-in with mentors at 3 PM. Tomorrow, demos are due at noon, and Final Judging is at 2 PM.",
      grounding_source_id: "evt-001,evt-002,evt-003,evt-004,evt-005",
      runware_b_roll_prompt: null,
      ui_action_card: {
        is_active: true,
        card_type: "calendar_join",
        title: "Join Hackathon Kickoff",
        description: "Main Stage, Moscone Center — 9:00 AM",
        action_label: "Join Meeting",
        action_payload: "https://meet.example.com/hackathon-kickoff",
      },
    },
    {
      segment_id: 3,
      segment_type: "email_highlights",
      dialogue:
        "Two emails need your attention. Sarah from the hackathon org sent the venue map and WiFi details — password is BuildFast. And your CTO needs you to review slides 12 through 18 on AI strategy for Monday's board meeting.",
      grounding_source_id: "email-001,email-002",
      runware_b_roll_prompt: null,
      ui_action_card: {
        is_active: true,
        card_type: "email_reply",
        title: "Reply to CTO: Board Deck Review",
        description: "Review slides 12-18 on AI strategy before Monday",
        action_label: "Draft Reply",
        action_payload: "mailto:cto@mycompany.com?subject=Re:Q1+Board+Deck",
      },
    },
    {
      segment_id: 4,
      segment_type: "project_updates",
      dialogue:
        "On the dev side, PROJ-1234 about avatar pipeline latency is still in progress — that's assigned to you. And Alex has a PR ready for review: adding streaming responses to the briefing endpoint.",
      grounding_source_id: "PROJ-1234,PR-89",
      runware_b_roll_prompt: null,
      ui_action_card: {
        is_active: true,
        card_type: "github_review",
        title: "Review PR: Streaming Briefing Endpoint",
        description: "feat: add streaming response to briefing endpoint by alex-dev",
        action_label: "Open PR",
        action_payload: "https://github.com/example/repo/pull/89",
      },
    },
    {
      segment_id: 5,
      segment_type: "weather",
      dialogue:
        "Weather in San Francisco today: 62 degrees, partly cloudy, high of 67. Pleasant day with a light breeze — no rain expected. Great weather for the hackathon.",
      grounding_source_id: "weather",
      runware_b_roll_prompt: "San Francisco skyline partly cloudy day, golden gate bridge in background, beautiful weather, cinematic photography",
      ui_action_card: {
        is_active: true,
        card_type: "weather_widget",
        title: "San Francisco Weather",
        description: "62°F — Partly Cloudy, High 67° / Low 55°",
        action_label: "",
        action_payload: "",
      },
    },
    {
      segment_id: 6,
      segment_type: "closing",
      dialogue:
        "That's your briefing. Remember: demo submissions are due tomorrow at noon. Make it count — good luck at the hackathon! I'll see you tomorrow morning with your next update.",
      grounding_source_id: "evt-004",
      runware_b_roll_prompt: null,
      ui_action_card: {
        is_active: true,
        card_type: "link_open",
        title: "Venue Map",
        description: "View the hackathon venue layout",
        action_label: "Open Map",
        action_payload: "https://hackathon.example.com/venue-map",
      },
    },
  ],
};
