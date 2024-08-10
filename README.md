# Name Killer
This project allows you to remove all instances of a name from a project.

## Usage
To include private repos, you will need to provide a personal access token. You can generate one [in your GitHub account settings](https://github.com/settings/personal-access-tokens/new).

When creating the token, you will need to change `Repository access` to `All repositories`, and under _Repository permissions_, set `Metadata` to `Read-only`. This is the only access needed as the API is only used to fetch a list of your repositories. If you do not care about private repos, you can skip this step and it will run for your public repos only.

### Setting up Config
The project is configured using a JSON file. This file is located at `<project root>/config/config.json`. You will need to create this file, which you can do by copying and editing the provided `config.example.json` file and renaming it to `config.json`.