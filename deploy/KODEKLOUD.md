# Deploying VidyaNexus on KodeKloud

The whole app (website, API and database) runs as **one Docker container**, so a deploy is one script. KodeKloud playgrounds are temporary: when a session ends the machine and its data are wiped, so just run the steps again next time (about 5 minutes).

You need:

- **A Claude API key** (optional but needed for the real AI Tutor). Create one at <https://console.anthropic.com> → *Settings → API keys*, and add some credit under *Billing*. Without a key the app still works, and the AI Tutor gives offline sample answers.

## Option A: Docker playground (quickest, for demos)

1. Open **Playgrounds → Container → Docker** on KodeKloud and wait for the terminal.
2. Run:

   ```bash
   git clone https://github.com/gunasekar89/VidyaNexus-AI.git
   cd VidyaNexus-AI
   bash deploy/setup.sh
   ```

   (Until the pull request is merged, clone the branch instead: add `-b claude/project-thread-bit97y` after `git clone`.)

3. When it asks, paste your Anthropic API key (it is saved only in `VidyaNexus-AI/.env` on that machine) or press Enter to skip.
4. Open the app on port **80** with the playground's option for opening an app port in your browser. If you can't find that option, use Option B (AWS) for a public link.

The **Ubuntu 22.04 / Ubuntu playground** works the same way; the script installs Docker for you if it's missing.

## Option B: AWS playground (public URL you can share)

1. Open **Playgrounds → Cloud → AWS** and sign in to the AWS console with the details KodeKloud gives you.
2. Go to **EC2 → Launch instance**:
   - Name: `vidyanexus`
   - Image: **Ubuntu Server 24.04 LTS**
   - Instance type: `t3.small` if allowed, otherwise `t2.micro` / `t3.micro` (the script adds swap so small machines can build)
   - Key pair: create one and download it
   - Network settings → *Edit*: allow **SSH (22)** from *My IP* and **HTTP (80)** from *Anywhere*
3. Launch, then click the instance → **Connect → EC2 Instance Connect → Connect** (opens a terminal in your browser).
4. Run the same commands as in Option A step 2.
5. The script prints `http://<public-ip>` at the end. Open it in your browser and share it.

## After it's running

- **Logins**: student `ananya.s@vidyanexus.school` / `ananya123`, teacher `lakshmi.r@vidyanexus.school` / `teacher123`. Change them from *Profile → Change password* before sharing a public link; the demo hints disappear from the login page once you do.
- **Add or change the API key later**: edit `.env` (`nano .env`), then run `sudo docker compose up -d`.
- **Logs**: `sudo docker compose logs -f`
- **Update to the latest code**: `git pull && sudo docker compose up -d --build`
- **Start over with fresh demo data**: `sudo docker compose down -v && sudo docker compose up -d`
- **Data** lives in the Docker volume `vidyanexus-data` (an SQLite file), so it survives restarts and rebuilds on the same machine.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Page doesn't open from outside | Check port 80 is open (AWS security group *Inbound rules*). |
| `port is already allocated` | Something else uses port 80. Set `APP_PORT=8080` in `.env`, run `sudo docker compose up -d`, and open port 8080 instead. |
| AI Tutor says "offline mode" | `.env` has no `ANTHROPIC_API_KEY`. Add it and run `sudo docker compose up -d`. |
| AI Tutor says the key isn't valid | Re-copy the key from the Anthropic console; check your account has credit. |
| Build is killed on a tiny machine | Run `bash deploy/setup.sh` again (it adds swap), or pick a bigger instance. |
