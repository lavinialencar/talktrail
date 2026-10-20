<p align="center"><img src="docs/banner.png" alt="Talktrail: Google Meet transcripts, only on your computer" width="100%"></p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/talktrail/jneejlpdlldinjnilghnndennbnpbeak"><img src="docs/btn-loja.svg" height="40" alt="Install Talktrail from the Chrome Web Store" /></a>
  <a href="https://buymeacoffee.com/talktrail"><img src="docs/btn-cafe.svg" height="40" alt="Buy me a coffee" /></a>
</p>

# Talktrail

[Português](README.md) | **English**

**A free Chrome extension that turns Google Meet captions into a Markdown file on your computer.** No account, no cloud, no telemetry. It reads the captions Meet already shows, keeps the live text in a side panel, and saves each meeting as a `.md` file you can open in Obsidian, search, or hand to an AI.

> The extension's interface is in Portuguese for now. An English interface is the next big update. Everything else on this page already applies.

## What it does

- **Google Meet transcript, live.** When you join a call it offers to transcribe and turns captions on for you. The text shows up in a side panel, with who spoke and when.
- **One Markdown file per meeting**, with title, tags, date, duration and participants, then the transcript by speaker. If you rename the meeting, the file is renamed, not duplicated.
- **Meeting notes and agendas in the same panel.** Each meeting has its own agenda. An Agendas page lists your upcoming meetings (they come from the Meet home page), and the agenda loads by itself when you enter the room. The toolbar icon counts down to the next meeting.
- **Agendas as files an AI can edit.** With a folder chosen, each agenda also becomes a `.md` file in `Pautas/`. Edit it by hand or ask an AI to rewrite it, and the change shows up in the extension within a minute. The other direction works too.
- **Mark moments** with a keyboard shortcut, tag meetings, and export or import everything (meetings, agendas, settings) in a single backup file.
- **Words that must never be recorded**: list them in Settings and they are left out.

## Privacy

Everything stays on your computer. The extension only has access to `meet.google.com` and, if you install it, a small local server on `127.0.0.1`. There is no account, no analytics and no remote server. Read the [privacy policy](PRIVACIDADE.md).

Recording or transcribing a meeting may require the consent of the people in it. Tell them you are transcribing. Talktrail is not affiliated with Google; Google Meet is a trademark of Google LLC.

## Install

**From the Chrome Web Store (recommended):** [Talktrail on the Chrome Web Store](https://chromewebstore.google.com/detail/talktrail/jneejlpdlldinjnilghnndennbnpbeak). It works in Chrome, Edge, Brave and other Chromium browsers. Join a Meet call in a normal tab and click **Transcribe** on the prompt.

**Two ways to store meetings:**

| | Simple mode | Live folder |
|---|---|---|
| What you install | Just the extension | The extension plus a small Python server |
| Where meetings go | The extension library, then `Downloads/Talktrail/YYYY-MM/` when the call ends | A folder you choose, updated every few seconds |
| Good for | Using it with zero setup | Obsidian, scripts, AI tools |

The extension picks automatically: if the local server answers, it uses the live folder; otherwise simple mode. You can also pick a folder without Python, using your browser's own folder picker (Settings, "Choose a folder"). The server is optional: Settings has an "Install the add-on" button that downloads an installer for Mac, Windows or Linux. It is a single Python file with no dependencies that listens only on `127.0.0.1`.

## FAQ

**Does Talktrail work without an account?** Yes. There is nothing to sign in to.

**Where is my data stored?** On your computer: in the extension's library and in the folder you choose. Nothing is uploaded.

**Does it work with Zoom or Microsoft Teams?** No. It works with Google Meet only.

**Does it record audio?** No. It saves the text of the captions Meet shows. Captions must be on, and the quality is that of Meet's captions: the caption language must match the language being spoken.

**Is it a free alternative to Otter, Fireflies or Tactiq?** It covers the transcript-to-file part for Google Meet, for free and locally. It does not summarize with AI by itself. The Markdown file is meant to be handed to the AI you already use.

**How can an AI edit my meeting agenda?** With a folder chosen, each agenda is a `.md` file in `Pautas/`, with a `LEIA-ME.md` explaining the format. Point an AI tool at that folder, ask for the change, and the agenda updates in the extension within about a minute.

**Does it work offline?** The extension and the files are local. You still need the Meet call itself, since the captions come from it.

**Is it open source?** Yes, MIT license. The code is in this repository.

## Known limits

- The quality of the text is the quality of Meet's captions. Technical names are often wrong.
- Google changes the Meet page now and then. If captions stop being picked up after a Meet update, open an issue.
- The Windows and Linux installers were prepared and tested by simulation, not yet on a real machine. If something fails, open an issue with your system and the error message.

## Support

Talktrail is free. If it helped you, [a coffee](https://buymeacoffee.com/talktrail) keeps it alive and growing. Bugs and ideas are welcome as [issues](https://github.com/lavinialencar/talktrail/issues).
