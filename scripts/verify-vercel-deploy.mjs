// Prove that Vercel production is READY for the exact merged commit.
// Authentication is header-only; tokens never enter URLs or logs.
import { appendFileSync } from 'node:fs';

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;
const sha = process.env.MERGED_COMMIT_SHA;
const timeoutMs = Number(process.env.DEPLOY_VERIFY_TIMEOUT_MS || 15 * 60_000);
const pollMs = Number(process.env.DEPLOY_VERIFY_POLL_MS || 15_000);

for (const [name, value] of Object.entries({
  VERCEL_TOKEN: token,
  VERCEL_PROJECT_ID: projectId,
  MERGED_COMMIT_SHA: sha,
})) {
  if (!value) {
    console.error(`${name} is required; deployment cannot be proven`);
    process.exit(1);
  }
}
if (!/^[0-9a-f]{40}$/i.test(sha)) {
  console.error('MERGED_COMMIT_SHA must be a full 40-character commit SHA');
  process.exit(1);
}

const deadline = Date.now() + timeoutMs;
let lastState = 'NOT_FOUND';

while (Date.now() < deadline) {
  const url = new URL('https://api.vercel.com/v7/deployments');
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('target', 'production');
  url.searchParams.set('sha', sha);
  url.searchParams.set('limit', '20');
  if (teamId) url.searchParams.set('teamId', teamId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error(`Vercel API ${response.status}: ${detail}`);
    process.exit(1);
  }

  const body = await response.json();
  const deployments = Array.isArray(body.deployments) ? body.deployments : [];
  const deployment = deployments.find((item) => {
    const deployedSha = item?.meta?.githubCommitSha || item?.gitSource?.sha;
    return deployedSha === sha && item?.target === 'production';
  });

  if (deployment) {
    lastState = deployment.readyState || deployment.state || 'UNKNOWN';
    console.log(`production deployment ${deployment.uid || deployment.id}: ${lastState}`);
    if (lastState === 'READY') {
      const deploymentId = deployment.uid || deployment.id;
      const deploymentUrl = `https://${deployment.url}`;
      const verifiedAt = new Date().toISOString();
      if (!deploymentId || !deployment.url) {
        console.error('READY deployment lacked id/url evidence');
        process.exit(1);
      }
      if (process.env.GITHUB_ENV) {
        appendFileSync(
          process.env.GITHUB_ENV,
          `DEPLOYMENT_ID=${deploymentId}\nDEPLOYMENT_URL=${deploymentUrl}\n` +
            `DEPLOYMENT_STATE=READY\nDEPLOYMENT_VERIFIED_AT=${verifiedAt}\n`,
        );
      }
      console.log(`verified READY production deployment for ${sha}: ${deploymentUrl}`);
      process.exit(0);
    }
    if (['ERROR', 'CANCELED'].includes(lastState)) {
      console.error(`production deployment for ${sha} ended in ${lastState}`);
      process.exit(1);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

console.error(`deployment for ${sha} was not proven READY before timeout (last state: ${lastState})`);
process.exit(1);
