# Calendar Helper — Roadmap

## What This Is

A travel coordination app for groups of people who travel frequently — long-distance couples, families, friend groups, or small teams. Users forward booking confirmation emails, which get automatically parsed into shared timeline events. The app shows when you'll be in the same place, helps you stay on top of logistics, and gives everyone a single view of the plan.

## Who Uses It

- **Long-distance couples** coordinating visits and trips
- **Families** planning holidays together
- **Friends** organising group trips
- **Anyone** who wants a clean, shared travel timeline without manually entering events

## User Scenarios

These are the real situations that drive every design decision.

### 1. "When are we next together?" — The Countdown
The most common check. Multiple times a day. User opens the app just to see the countdown — how many days until they're in the same city. This is the emotional core of the app.

### 2. "Am I ready to go?" — Travel Day
Day of travel, high urgency. Need to see: what time to leave, terminal, gate, booking reference. Quick answers, no scrolling.

### 3. "What's the plan?" — Trip Overview
Reviewing the full itinerary a few days before travel. Scanning chronologically: flights, hotels, activities. Spotting gaps ("do we have a hotel for Saturday?"). Seeing together-times in context.

### 4. "Where's my booking reference?" — Detail Lookup
At a check-in desk or reception. Need one specific piece of info immediately. Tap the right event, see the reference, ideally copy it.

### 5. "What's my partner doing?" — Connection
Checking where the other person is — mid-flight? Just landed? At the hotel? Provides a feeling of connection and awareness.

### 6. "We're together now" — Current Visit
During time spent together. The app shifts from countdown to "time remaining." Shows what's planned, when the next separation starts.

### 7. "Do the timings work?" — Logistics Check
Checking if connections work: enough gap between landing and the next train? Are arrival and departure cities aligned? Spotting problems before they happen.

### 8. "We need to leave soon" — Urgency Alert
Leave-by time is approaching. The app should make this unmissable — colour-coded, prominent, maybe even above the together countdown when it's urgent.

## UI Layout Strategy

### Mobile-First (primary device is a phone)

**Bottom tab navigation** — reachable with one thumb while walking through an airport:
- Home (dashboard)
- Timeline
- Groups
- Profile
- (Future: Chat/AI tab in 5th position)

**Slim top header** — app name only, not navigation.

**Collapsible event cards** — collapsed by default showing one compact row (icon, title, times, status). Tap to expand for full details. This is the single biggest UX improvement: makes timelines scannable and detail-lookup fast.

**Context-sensitive dashboard** — what's shown first depends on what matters now:
- Normally: together countdown (the emotional anchor)
- Travel day with urgency: leave-by time gets promoted
- Currently together: remaining time together

### Desktop
Keep the current top navigation bar. Content area already works at wider widths.

## Phased Feature Plan

### Phase 1: Mobile UI Cleanup ✅
Make the existing features work well on phones.

- ✅ Bottom tab navigation for mobile
- ✅ Collapsible event cards (tap to expand)
- ✅ Dashboard: together countdown as hero, merged event card
- ✅ Timeline: horizontally scrollable filter pills, compact cards
- ✅ iOS safe area support
- ✅ Booking reference tap-to-copy
- ✅ Sign-out moved to Profile page
- ✅ Avatar upload: crop/resize to 256×256 JPEG, accepts up to 10MB + HEIC

### Phase 2: Richer Context ✅
Make the app smarter about what it shows when.

- ✅ **Urgency promotion**: When leave-by is amber/red, it takes over as the dashboard hero — above the together countdown. Shows "Leave in 45m" with terminal, gate, booking ref at a glance
- ✅ **Partner status**: Derives real-time-ish status from events — "✈️ En route to LHR, landing in 3h", "📍 In London", "🏠 Home in Hong Kong". Shown on dashboard in the partner section
- ✅ **Address display**: Event addresses are tappable links that open in Apple Maps. Map-pin icon to make it obvious it's tappable
- ✅ **Currently-together enhancements**: When together, shows upcoming events during this visit period below the hero (mini itinerary)
- ✅ **Trip grouping**: Auto-detect trips (cluster events within 48h gaps) and show them as named, collapsible sections in the timeline (e.g., "🧳 London & Paris · 3–10 Mar · 8 events"). Events not part of a trip shown under "Other events"

### Phase 3: AI Features
Add intelligence to the trip planning experience.

- **Trip analysis**: Button to send the current trip to an LLM — "anything missing? Any tight connections? Suggestions?" Returns actionable insights
- **Group AI chat**: A chat interface where all group members can ask questions about the trip — "find us a restaurant near the hotel on Saturday", "what's the weather like?", "is there enough time between our landing and the train?"
- **Smart suggestions**: Proactive nudges — "You have a 6-hour gap in London with no hotel booked" or "Your partner arrives 3 hours before you — they might want a lounge suggestion"

### Phase 4: Polish & Social
- **Notifications**: Push notifications for leave-by reminders, partner arrivals
- **Trip sharing**: Generate a shareable trip summary (link or PDF)
- **Trip memories**: Past trips as a browseable archive with together-time highlights
- **Multi-group support**: Manage multiple groups (e.g., partner group + family group)
