const fs = require('fs');

let raw = fs.readFileSync('draft_audit_utf8.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const players = JSON.parse(raw);

const categories = {
    'Wicketkeeper': [],
    'Batter': [],
    'All-rounder': [],
    'Bowler': []
};

const errors = [];

players.forEach(p => {
    if (categories[p.draftCategory]) {
        categories[p.draftCategory].push(p);
    } else {
        errors.push(`Player ${p.name} has invalid or missing draftCategory: ${p.draftCategory}`);
    }
});

let md = `# Draft Mode Categorization Audit\n\n`;

md += `## ?? Wicketkeepers (Total: ${categories['Wicketkeeper'].length})\n`;
categories['Wicketkeeper'].forEach(p => {
    md += `- ${p.name} (Role: ${p.role})\n`;
});
md += `\n`;

md += `## ?? Batters (Total: ${categories['Batter'].length})\n`;
categories['Batter'].forEach(p => {
    md += `- ${p.name} (Role: ${p.role})\n`;
});
md += `\n`;

md += `## ? All-rounders (Total: ${categories['All-rounder'].length})\n`;
categories['All-rounder'].forEach(p => {
    md += `- ${p.name} (Role: ${p.role})\n`;
});
md += `\n`;

md += `## ?? Bowlers (Total: ${categories['Bowler'].length})\n`;
categories['Bowler'].forEach(p => {
    md += `- ${p.name} (Role: ${p.role})\n`;
});
md += `\n`;

md += `## Verification\n`;
md += `- **Total Players Processed**: ${players.length}\n`;
md += `- **Sum of Categories**: ${categories['Wicketkeeper'].length + categories['Batter'].length + categories['All-rounder'].length + categories['Bowler'].length}\n`;
if (errors.length === 0) {
    md += `- **Status**: ? All players belong to exactly one valid \`draftCategory\`.\n`;
} else {
    md += `- **Errors**: \n` + errors.join('\n') + `\n`;
}

md += `\n## Questionable Categorization (Modern T20 Context)\n`;
md += `*Note: The following observations are based on modern T20 cricket roles and the current dataset.*\n\n`;
md += `- **Rashid Khan** is categorized as a Bowler (Spinner). While primarily a bowler, in modern T20s he often plays the role of a lower-order finisher/all-rounder for franchises. Depending on draft balance, he could be argued as an All-rounder.\n`;
md += `- **Pat Cummins** and **Mitchell Starc** are categorized as Bowlers, which is accurate, but Cummins has frequently functioned as a bowling all-rounder in the IPL.\n`;
md += `- **Sunil Narine** and **Andre Russell** are correctly categorized as All-rounders based on the exception list, overriding their standard Spinner/Finisher roles.\n`;

fs.writeFileSync('C:/Users/SAMMYAG/.gemini/antigravity-ide/brain/97f2b955-ebc3-4bed-bd4f-6f777b8632c9/draft_category_audit.md', md, 'utf8');
console.log('Markdown generated');
