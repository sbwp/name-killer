# Name Killer
Name Killer removes all instances of a name from a project.

But like, it's probably a bad idea. This is only for when you absolutely want to scrub a name from the history of a project to the point where you are willing to destructively scrub the history. You probably don't want to do this, and if anybody else works on any of these repos, you _absolutely_ should ask them and make sure they understand the ramifications before doing this.

I'm sharing this to save other people time, but if you think you wouldn't be able to figure this out on your own by googling and doing the same steps I did to make this, you probably should not use this, because you will need to really understand git if something goes wrong and you need to recover.

## What it does
It uses the GitHub API to get a list of all of your repos, clones them, changes the author of all past commits by the given user, and replaces all instances of the provided name across the commit history.

This action is quite destructive, and so this project should be used with extreme care. It requires force-pushing over every repo, so be careful. By default, it creates a backup copy locally of every repo, so you can force push that back to the remote if something goes horribly wrong.

Since this is just what I wrote for myself, it assumes that none of the projects have other currently active contributors. If they do, make sure to communicate with them, as they will need to ideally commit all work to the default branch, pause development, wait for you to run this process, and then `git fetch` and `git reset origin/main --hard` to receive the new version. If they continue workingor have changes in branches while you do this, you will need to figure out how to reconcile both sets of changes, and it probably will not be easy.

## Setup
### Creating GitHub Personal Access Token
To include private repos, you will need to provide a personal access token. You can generate one [in your GitHub account settings](https://github.com/settings/personal-access-tokens/new).

When creating the token, you will need to change `Repository access` to `All repositories`, and under _Repository permissions_, set `Contents` to `Read-only`. This is the only access needed as the API is only used to fetch a list of your repositories and looks at the commit history to see the names of authors. If you do not care about private repos, you can skip this step, and it will run for your public repos only.

### Config Setup
The project is configured using a JSON file. This file is located at `<project root>/config/config.json`. You will need to create this file, which you can do by copying and editing the provided `config.example.json` file and renaming it to `config.json`.

#### Config Fields
- `githubUsername`: **(Required)** This field specifies which GitHub user's repos to run on. In order to push changes, you will need push access to the repos, but this is intended to be the same user you are locally authenticated as.
- `githubPersonalAccessToken`: This field is a string containing your gitHub personal access token. It is not required, but without it, only your public repos will be processed. You can alternatively provide the token as an environment variable named `NK_GH_PERSONAL_ACCESS_TOKEN` if you prefer.
- `mode`: **(Required)** This field determines which set of actions to take. The following options are available:
    - `get-authors`: This mode only checks the GitHub API for the list of repos and creates a list of all authors of commits to those repos, in the `<working directory>/repos/authors.json` file. Use this to find which names exist that need to be replaced in commit author names.
    - `dry`: The GitHub API is used to get a list of repos only. Changes will be made locally in the `repos` folder, but will not be pushed to the remote.
    - `apply`: If the dry run changes look good, use this mode to force push those changes to the remote
    - `yolo`: Equivalent to running `dry`, then `apply`.
- `workingDirectory`: **(Required)** This is where the repos will be cloned and backups will be stored. This must be not in any folder inside a Git repository. You must specify it as an absolute path (not relative).
- `protocol`: (Default: `"https"`) This field can be set to `"https"` or `"ssh"` and specifies how to clone the repositories. Since it relies on whatever credentials or certificates are configured locally for git to use, use whatever you use typically.
- `oldAuthorNames`: Author names currently found in the repos that are no longer wanted. If provided, each string in this array is compared with the author name on each historical commit on a repo. If it is, the name and email on the commit are changed to the `newAuthorName` and `newAuthorEmail`.
- `newAuthorName`: The author name to change the old ones to.
- `oldAuthorEmails`: Author emails currently found in the repos that are no longer wanted. If provided, each string in this array is compared with the author email on each historical commit on a repo. If it is, the name and email on the commit are changed to the `newAuthorName` and `newAuthorEmail`.
- `newAuthorEmail`: The author email to change the old ones to.
- `textReplacements`: If provided, each key/value pair will be used to do a replacement. Any occurrences of the key in the content of the repo will be replaced with the value. A few important notes:
    - Replacements are done in the order listed, so think about what will need to be done first. For example, if you first replace "catopus" with "octocat" and then try to replace "xXcatopusXx" with "xXsillybillyXx", the second replacement will never occur because all instances would have already changed to "xXoctocatXx" due to the earlier rule.
    - Replacements are case-sensitive. This was an intentional decision so that you can choose to replace for example "Catopus" with "Octocat" and "catopus" with "octocat" rather than the cases being always normalized to one final value. Also that way if the old username is the old name in lower case, but the new username isn't the new name in lowercase, the lowercase version can be assumed to be the username, and the capitalized version can be assumed to be the name.
- `createBackups`: (Default: `true`) This field specifies whether to create a backup of each repository before rebasing. If you specify the value as `true`, a copy of each repo will be created in the `<working directory>/repos/backups` folder, but will not be pushed to the remote. If you specify the value as `false`, changes will be pushed to the remote.

### Installing git filter-repo
You will need git filter-repo to run this. If you don't have it already:
1. run `python3 -m pip install --user git-filter-repo`.
2. If you are on Windows, you may need to add  `%AppData%\Roaming\Python\Python311\Scripts` to your user PATH variable.
3. To confirm that it worked, restart your terminal if you've just modified your PATH, and run `git filter-repo` to confirm that it works. If it says "No arguments specified.", then it works. If it says "git: 'filter-repo' is not a git command. See 'git --help'.", then it is not working.
4. If it still doesn't work for some reason, 🤷‍♀️

## Usage
First you will probably want to run it in `get-authors` mode. This will create a file `<working directory>/repos/authors.json`, which will list all authors or committers of commits on your repo. Use this to find any emails or names you might have missed when configuring the `oldAuthorNames` and `oldAuthorEmails` config fields. Note that this does not include uses of the name in code comments or other text in the repo, so you have to use your best guesses to configure the `textReplacements` config field.

Next, you will want to run `dry` mode. You could run `yolo` mode instead, but I really don't recommend running it without seeing what it does first.

Once that finishes, take a look at the repos. Try running `git log` to see if the author replacements worked, and inspect files that you know contained the `textReplacements` specified.

If you're happy with the changes, go ahead and run `apply` mode. This will push everything up to the remotes, and when it finishes, you are all set.

If you want to clear it all out and run fresh, just delete the contents of the working directory. I didn't bother adding a clean command or any steps to clean out past runs to benefit from the speed benefit of skipping over the cloning. That also means it might mess up the backups, but I already finished using this, so I don't plan on fixing it any time soon.

## Contributing
Feel free to submit PRs, issues etc. I don't actively monitor things, so I might not see it for a while. This was a very quick project, so I don't really have a strategy around this stuff, so just feel free to fork, make any changes you want, and if you think they should be merged in, open a PR. 🤷‍♀️

## Limitations
This will not affect any commits to repos you do not own. This also will not find usages of the name inside of commit messages, pull request texts, GitHub conversations, etc.

It also assumes there are no active branches other than the default branch (as set in GitHub), and will render those branches diverged and therefore unable to be merged into the default branch.

## Extensibility
It should be fairly easy to modify this to support other Git server providers if they have similar APIs available. If you want to run this against repos owned by an organization that you have push access to, it shouldn't be too difficult to make changes to make that work. Be sure to communicate with other contributors to the affected repos though.
