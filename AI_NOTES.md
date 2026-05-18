# AI Usage Documentation

This document describes how I used AI tools to build Pawnder and reflects on what worked well and what didn't.

## AI Tools Used

I used three AI tools throughout this project:

1. **Lovable** - Web-based AI UI builder
2. **Claude Code** - AI coding assistant in VS Code
3. **Claude (chat)** - Planning and architecture guidance

## Which parts of the system did Claude write end-to-end?

Claude Code wrote the complete frontend application including all three screens (authentication with email login/signup, the swipe card interface with gesture controls, and the results view with three sorting modes). It also handled the Supabase integration, setting up the database client and all the API calls for fetching pets, recording votes, and aggregating results.

On the backend side, Claude wrote the seed script that fetched 100 pet photos from the Unsplash API and populated the database with names, breeds, and descriptions. I assisted with the database schema SQL and Supabase connections.

## Where did you have to push back on, fix, or rewrite Claude's output?


The Results screen had a critical bug where it only showed the current user's own votes instead of global voting statistics from all users. When I tested with multiple browser windows as different users, each person saw different results.

I had to give Claude Code a detailed prompt explaining that the page should query the `results` view (which aggregates all votes) instead of the `votes` table filtered by user ID. Claude fixed the query and also implemented the three sorting algorithms correctly (Most Loved, Most Divisive, Most Voted). After that fix, all users saw the same aggregate data as intended.

## One thing Claude did better than expected, and one thing it did worse

### Better Than Expected

Claude Code analyzed the partially-completed Lovable project and perfectly matched the existing design system. It picked up the coral/orange color scheme, the rounded card styles, the button designs, and even the animation timing. I expected to have to give detailed styling instructions, but it automatically maintained consistency across all the new screens it built. The swipe gestures and visual polish looked professional without extra prompting.

### Worse Than Expected

Claude didn't proactively test edge cases or catch the Results aggregation bug during initial implementation. It took me manually testing with multiple users before I discovered votes weren't aggregating globally.

Claude also didn't initially include proper error handling or loading states. I had to explicitly request a polish pass to add those. It focused on happy-path functionality first and needed guidance to handle errors and empty states.

## How each AI tool was used

### Lovable
**Role:** Initial UI creation and design system

Lovable started the project by building the authentication screen and establishing the visual design. I gave it a prompt describing a "mobile-first pet voting app with warm, friendly design" and it generated:
- The coral/orange color scheme with gradient backgrounds
- Modern card layouts with rounded corners and shadows
- The authentication form with email/password inputs
- Responsive mobile layout (390×844 viewport)

Lovable ran out of free credits halfway through building the swipe screen, so I had to switch tools.

### Claude Code
**Role:** Feature completion, bug fixing, and implementation

Claude Code picked up where Lovable stopped. I gave it the exported code from Lovable and prompted it to:
1. Analyze the existing design patterns and color scheme
2. Complete the swipe screen with react-tinder-card gestures
3. Build the results screen with three sorting modes
4. Fix bugs when I found them during testing

Claude Code also wrote:
- The database seed script (fetch from Unsplash, populate Supabase)
- The API verification script (test endpoints and RLS policies)
- Error handling and loading states during the polish pass

### Claude (Chat Interface)
**Role:** Architecture planning and problem-solving

Before writing any code, I used Claude chat to:
- Decide on the tech stack (React + Supabase vs custom backend)
- Plan the database schema (items, votes, results view)
- Understand the assignment requirements and map them to features
- Write effective prompts for Lovable and Claude Code
- Debug issues by explaining errors and generating SQL fixes

Claude chat acted as a technical advisor, helping me make decisions and troubleshoot problems.

