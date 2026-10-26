# Deploying VidyaNexus on KodeKloud

The whole app (website, API and database) runs as **one Docker container**, so a deploy is one script. KodeKloud playgrounds are temporary: when a session ends the machine and its data are wiped, so just run the steps again next time (about 5 minutes).

The real AI Tutor needs **one** of these (without either, the app still works and the tutor gives offline sample answers):

- **Azure OpenAI from the KodeKloud Azure playground** (no extra cost to you). See [Getting an Azure AI key](#getting-an-azure-ai-key-kodekloud-azure-playground) below. Get this first, then deploy the app.
- **A Claude API key** from <https://console.anthropic.com> → *Settings → API keys* (needs credit under *Billing*).

## Getting an Azure AI key (KodeKloud Azure playground)

1. Open **Playgrounds → Cloud → Azure** and sign in to the Azure portal with the details KodeKloud gives you.
2. Search for **Azure OpenAI** → **Create**. Pick the resource group the playground gives you, any allowed region (e.g. *East US* or *Sweden Central*), a unique name, pricing tier **Standard S0** → **Review + create** → **Create**.
3. When it's ready, open the resource → **Go to Azure AI Foundry portal** (or *Explore Foundry portal*).
4. **Deployments → Deploy model → Deploy base model**, choose **gpt-4o-mini** (or gpt-4o / gpt-4.1-mini, whichever the playground allows) → **Deploy**.
5. Open the new deployment and copy the **Target URI** and the **Key**. The setup script asks for exactly these two.

If a model or region is blocked by the playground's rules, try another region or another model from the list; any chat model with structured outputs works (gpt-4o-mini, gpt-4o, gpt-4.1 family).

The Azure playground only hosts the AI here. Run the app itself on the Docker or Ubuntu playground (Option A) or a cloud VM (Option B); it calls Azure over the internet.

## Option A: Docker playground (quickest, for demos)

1. Open **Playgrounds → Container → Docker** on KodeKloud and wait for the terminal.
2. Run:

   ```bash
   git clone https://github.com/gunasekar89/VidyaNexus-AI.git
   cd VidyaNexus-AI
   bash deploy/setup.sh
   ```

   (Until the pull request is merged, clone the branch instead: add `-b claude/project-thread-bit97y` after `git clone`.)

3. When it asks which AI to use, choose **1** and paste the Azure **Target URI** and **Key** (or **2** for a Claude key, **3** to skip). They are saved only in `VidyaNexus-AI/.env` on that machine.
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
- **Add or change the AI settings later** (for example a new Azure playground key): edit `.env` (`nano .env`), then run `sudo docker compose up -d`. `curl localhost/api/health` shows which AI is in use.
- **Logs**: `sudo docker compose logs -f`
- **Update to the latest code**: `git pull && sudo docker compose up -d --build`
- **Start over with fresh demo data**: `sudo docker compose down -v && sudo docker compose up -d`
- **Data** lives in the Docker volume `vidyanexus-data` (an SQLite file), so it survives restarts and rebuilds on the same machine.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Page doesn't open from outside | Check port 80 is open (AWS security group *Inbound rules*). |
| `port is already allocated` | Something else uses port 80. Set `APP_PORT=8080` in `.env`, run `sudo docker compose up -d`, and open port 8080 instead. |
| AI Tutor says "offline mode" | `.env` has no AI settings. Add the `AZURE_OPENAI_*` values (or `ANTHROPIC_API_KEY`) and run `sudo docker compose up -d`. |
| AI Tutor says the key isn't valid | Re-copy the Azure key (Azure playgrounds expire, so a new session means a new resource and key), or the Anthropic key. |
| AI Tutor says "something went wrong" with Azure | Run `sudo docker compose logs --tail 20`. A 404 means the deployment name or Target URI is wrong; a 400 about `response_format` means the model is too old, so deploy gpt-4o-mini or newer. |
| Build is killed on a tiny machine | Run `bash deploy/setup.sh` again (it adds swap), or pick a bigger instance. |
