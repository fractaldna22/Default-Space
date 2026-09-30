# AstroOo Discord bot

Run `run_astrooo.ps1` from PowerShell. The local `.venv` has the required packages installed.

For a fresh checkout, run `py -m venv .venv` and `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` in `src/discord`. Copy `.env.example` to `.env`, fill in your OpenAI API key and Discord bot token, and set APPLICATION_ID to the bot application's ID, SERVER_ID to your server ID, and USER_ID to the owner account's ID. Copy `astrooo_system_prompt.example.md` to `astrooo_system_prompt.md` to customize the persona; otherwise the example prompt is used.

The bot reads `src/discord/.env` for `API_KEY` (or `OPENAI_API_KEY`), `DISCORD_BOT_TOKEN`, `APPLICATION_ID`, and `SERVER_ID`. The prompt is in `astrooo_system_prompt.md` and stays local. The model is `openai/gpt-audio`, sent as `gpt-audio` to the OpenAI Chat Completions API. Every GPT Audio request places Default Space's 100 ms WAV primer before the first user text. Audio output is off by default.

Use `/audio_astrooo enabled:True` to attach AstroOo's Verse voice as a WAV file to his replies in the current channel. Requests explicitly use `stream: false`: the bot waits for the complete API response and posts the finished WAV with its text, without streaming chunks. Use `/audio_astrooo enabled:False` to turn it off, or `/audio_astrooo` to check its status. The setting persists across restarts. Josh or a server moderator can change it in a server; a DM participant can change it in a DM. Messages with image input use GPT-4.1 and remain text only.

AstroOo answers direct @mentions, DMs, and replies to its messages. It ignores other bots and general @everyone/@here mentions. Incoming messages enter one FIFO queue across all channels and DMs: the next model request starts only after the preceding response, tools, and Discord delivery finish. Errors are handled per message so another person's input is still processed.

To reset, use `/reset_astrooo` or send `@AstroOo reset` (or `reset` in a DM or reply). Messages it can see, including its own replies, are stored in the local `.message_log.sqlite3` database across restarts. A server or thread session starts with its first direct mention/reply plus at most two preceding messages. After an hour without a triggered message, the next trigger starts a new session. Reset starts one immediately. Each request uses that session's newest history within an estimated 90,000 input tokens; this is a ceiling, not a target. Josh's last ten DM messages (including AstroOo's replies) take priority in server requests. Older DMs stay on disk and can be recalled when Josh asks. The model receives display names, server/channel names, actual user IDs, and valid mention syntax.

Image inputs stay visible for three reply turns. Those turns use GPT-4.1 with no audio primer. The bot saves a compact visual description privately, releases the image bytes after the third turn, and uses that description with GPT Audio thereafter. New images get their own three-turn window. Image replies remain text only.

When a message is a Discord reply, AstroOo includes the referenced message's author and text directly beside the new message in the API input. If Discord can no longer fetch it, the bot checks its local message log.

Right-click one of AstroOo's messages and choose **Apps → Edit AstroOo message** to revise its text, or **Apps → Delete AstroOo message** to delete it. `/purge_astrooo count:5` deletes up to five of its recent messages in that channel; the count can be 1–30. In servers, Josh and members with Manage Messages can use these controls. In DMs, the DM participant can use them.

Use `/sync_astrooo` to refresh slash commands and Apps actions. Josh can use `/sync_astrooo reset:True` to clear stale registrations and rebuild them. From PowerShell, `run_astrooo.ps1 -SyncCommands` synchronizes without starting another bot; `run_astrooo.ps1 -ResetCommands` rebuilds the registrations. Commands sync globally and in the configured server at startup. Restart Discord if its Apps menu still shows cached actions.

AstroOo can issue hidden inline tools: `/tool[dm: "USER_ID":"message"]`, `/tool[react: {"message_id":"ID", "emoji":"🔥"}]`, `/tool[lookup_user: {"name":"name"}]`, and `/tool[recall_dm: {"query":"phrase"}]`. Tool commands are removed from visible replies; any generated audio containing a directive is withheld and regenerated after the action. Tool results tell the model whether an action actually succeeded. Josh can request DMs to other people; anyone else can request a DM to themselves. Private recall is restricted to Josh. Human reactions are logged with names, emoji counts, and the referenced message for subsequent replies. These are conversational context, not model training.

Stop AstroOo with **Ctrl+C in the terminal running it**. Press **Up Arrow, then Enter** to repeat the launch command after a code update. The local virtual environment includes PyNaCl and davey for Discord voice support; installing them alone does not add a voice-channel call feature.

The bot needs View Channel, Send Messages, Read Message History, Attach Files (audio), and Add Reactions in channels where those features are used. If it cannot read history, it still processes the current message when Discord delivers it.

Discord's Developer Portal must have **Message Content Intent** enabled for the app. The OAuth client secret is not used. The bot token must belong to application `1554782787570114570` and be saved as `DISCORD_BOT_TOKEN` in the local `.env`.
