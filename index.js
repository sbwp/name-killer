const { promisify } = require('util');
const { readFile, writeFile, cp, mkdir } = require('fs/promises');
const exec = promisify(require('child_process').exec);
const { join } = require('path');
const { makeAuthorCommand, makeExpressionsFile } = require('./filter-repo.js');

const validateConfig = config => {
    let valid = true;
    let reasons = [];

    if (!config.githubPersonalAccessToken) {
        // valid = false;
        // reasons.push('Missing githubPersonalAccessToken');
        console.warn('Missing githubPersonalAccessToken. Private repos will not be included.');
    }

    // noinspection EqualityComparisonWithCoercionJS
    if (!config.mode || typeof config.mode !== 'string' || !['get-authors', 'dry', 'apply', 'yolo'].includes(config.mode)) {
        valid = false;
        reasons.push('Property mode is required and must be either "get-authors", "dry", "apply", or "yolo".');
    }

    if (!config.githubUsername || typeof config.githubUsername !== 'string') {
        valid = false;
        reasons.push('Property githubUsername is required and must be a string.');
    }

    if (config.protocol && (typeof config.protocol !== 'string' || !['https', 'ssh'].includes(config.protocol))) {
        valid = false;
        reasons.push('Protocol must be either "https" or "ssh", or omitted to use https.');
    }

    return { valid, reason: reasons.join(' and ')};
};

const uniqueAuthors = commits => {
    const authors = commits.map(commit => ({ ...commit.commit.author, hash: commit.sha }));
    const committers = commits.map(commit => ({ ...commit.commit.committer, hash: commit.sha }));

    const emailNameMap = new Map();
    for (const author of [...authors, ...committers]) {
        if (!emailNameMap.has(author.email)) {
            emailNameMap.set(author.email, [new Set(), new Set()]);
        }
        const [names, commits] = emailNameMap.get(author.email);
        names.add(author.name);
        commits.add(author.hash);
    }

    return [...emailNameMap.entries()].map(([email, [names, commits]]) =>
        ({ email, names: [...names], commitCount: commits.size })
    );
};

const mkDirOrWhatever = async path => {
    try {
        return await mkdir(path);
    } catch {
        console.warn('tried to make dir but already existed: ' + path);
    }
};

const makeCommand = process.platform !== 'win32' ? x => x : command =>
    `"C:\\Program Files\\Git\\git-bash.exe" -c "${command.replace(/"/g, '\\"')}"`;

const runCommand = async (command, cwd) => {
    const realCommand = makeCommand(command);
    console.log(realCommand);
    if (realCommand.includes('author_name')) {
        process.exit(1);
    }
    const { stdout, stderr } = await exec(realCommand, { cwd });
    if (stderr && !stderr.includes('already exists and is not an empty directory')) {
        console.error(stderr);
    }
    return stdout;
}

const main = async () => {
    let config = undefined;

    const paths = {
        config: join(__dirname, 'config', 'config.json')
    };

    try {
        config = JSON.parse(await readFile(paths.config, 'utf8'));
        config.githubPersonalAccessToken = config.githubPersonalAccessToken ?? process.env.NK_GH_PERSONAL_ACCESS_TOKEN;
        config.createBackups = config.createBackups ?? true;
        config.oldAuthorNames = config.oldAuthorNames ?? [];
        config.oldAuthorEmails = config.oldAuthorEmails ?? [];
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse ${paths.config} as JSON. Reason: ${error.message}`);
        }
    }

    const validation = validateConfig(config);
    if (!validation.valid) {
        throw new Error(`Config file at ${paths.config} is not valid: ${validation.reason}`);
    }

    paths.backups = join(config.workingDirectory, 'backups');
    paths.repos = join(config.workingDirectory, 'repos');
    paths.expressionsFile = join(config.workingDirectory, 'repos', 'expressions.txt');
    paths.repoDetails = join(config.workingDirectory, 'repos', 'repo-details.json');
    paths.authors = join(config.workingDirectory, 'repos', 'authors.json');
    paths.authorCommand=join(config.workingDirectory, 'repos', 'author-command');

    await mkDirOrWhatever(paths.backups);
    await mkDirOrWhatever(paths.repos);

    let repos = [];
    const Authorization = config.githubPersonalAccessToken ? `Bearer ${config.githubPersonalAccessToken}` : '';
    try {
        const response = await fetch(
            `https://api.github.com/search/repositories?q=user:${config.githubUsername}`,
            { headers: new Headers({ Authorization }) }
        );
        repos = (await response.json()).items.filter(item => !item.archived);
    } catch (error) {
        throw new Error(`Failed to fetch GitHub repos via API: ${error.message}`);
    }

    let urlPropName;
    switch (config.protocol) {
        case 'https':
            urlPropName = 'clone_url';
            break;
        case 'ssh':
            urlPropName = 'ssh_url';
            break;
        default:
            urlPropName = 'clone_url';
            break;
    }

    repos = repos.map(item => ({
        name: item.name,
        url: item[urlPropName],
        branch: item.default_branch,
        archived: item.archived,
        path: join(paths.repos, item.name),
        backupPath: join(paths.backups, item.name)
    }));

    if (config.mode === 'get-authors') {
        repos = await Promise.all(
            repos.map(item => fetch(
                `https://api.github.com/repos/${config.githubUsername}/${item.name}/commits`,
                {headers: new Headers({Authorization})}
            ).then(result => result.json()).then(x => {
                Array.isArray(x) ? undefined : console.log(x);
                return x;
            }).then(commits => ({
                ...item,
                authors: uniqueAuthors(commits)
            })))
        );

        const authors = new Map();
        for (const repo of repos) {
            for (const author of repo.authors) {
                if (!authors.has(author.email)) {
                    authors.set(author.email, [new Set(), 0]);
                }
                const [names, commits] = authors.get(author.email);
                author.names.forEach(name => names.add(name));
                authors.set(author.email, [names, commits + author.commitCount]);
            }
        }
        const authorList = [...authors.entries()].map(([email, [names, commitCount]]) =>
            ({ email, names: [...names], commitCount })
        );

        await writeFile(paths.repoDetails, JSON.stringify(repos, null, 4), { encoding: 'utf8' });
        await writeFile(paths.authors, JSON.stringify(authorList, null, 4), { encoding: 'utf8' });
        return;
    }

    if (config.mode === 'dry' || config.mode === 'yolo') {
        const authorCommand = makeAuthorCommand(config);
        const expressions = makeExpressionsFile(config);

        if (authorCommand) {
            await writeFile(paths.authorCommand, authorCommand, { encoding: 'utf8' });
            await runCommand('chmod +x ./author-command', paths.repos);
        }

        if (expressions) {
            await writeFile(paths.expressionsFile, expressions, { encoding: 'utf8' });
        }

        for (const repo of repos) {
            try {
                await runCommand(`git clone ${repo.url}`, paths.repos);

                if (config.createBackups) {
                    await cp(repo.path, repo.backupPath, { recursive: true });
                }

                if (authorCommand) {
                    await runCommand('../author-command', repo.path);
                }

                if (expressions) {
                    await runCommand(`git filter-repo --replace-text ../expressions.txt`, repo.path);
                }

                // Re-add remote bc git filter-repo removes them for safety (we don't need safety where we're going)
                await runCommand(`git remote add origin ${repo.url}`, repo.path);
            } catch (e) {
                console.error(e);
            }
        }
    }

    if (config.mode === 'apply' || config.mode === 'yolo') {
        for (const repo of repos) {
            try {
                await runCommand(`git push -u origin ${repo.branch} --force`, repo.path);
            } catch (e) {
                console.error(e);
            }
        }
    }
};

void main().catch(console.error);
