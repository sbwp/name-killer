module.exports = {
    makeAuthorCommand: config => {
        if (!config.newAuthorName && !config.newAuthorEmail || config.oldAuthorEmails.length + config.oldAuthorNames.length === 0) {
            return '';
        }
        const emailConditions = config.oldAuthorEmails.map(
             email => `commit.author_email == b"${email}"`
        );
        const nameConditions = config.oldAuthorNames.map(
            name => `commit.author_name == b"${name}"`
        );
        const conditionStr = [...emailConditions, ...nameConditions].join(' or ');
        let command = 'git filter-repo --commit-callback \'\n'
        command += `if ${conditionStr}:` + '\n';
        if (config.newAuthorName) {
            command += `    commit.author_name = b"${config.newAuthorName}"` + '\n';
        }
        if (config.newAuthorEmail) {
            command += `    commit.author_email = b"${config.newAuthorEmail}"` + '\n';
        }
        command += "'";
        return command;
    },
    makeExpressionsFile: config => {
        if (!config.textReplacements || Object.getOwnPropertyNames(config.textReplacements).length === 0) {
            return '';
        }
        const replacements = Object
            .getOwnPropertyNames(config.textReplacements)
            .map(key => `${key}==>${config.textReplacements[key]}`);
        return replacements.join('\n') + '\n';
    }
}
