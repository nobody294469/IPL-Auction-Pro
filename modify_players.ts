import fs from 'fs';
import { PLAYERS } from './src/data/players';

const exceptions = ['Pollard', 'Bravo', 'Russell', 'Narine', 'Jadeja', 'Hardik', 'Maxwell', 'Livingstone'];

const updatedPlayers = PLAYERS.map(p => {
    let draftCategory = '';
    if (p.role === 'Wicket-keeper') {
        draftCategory = 'Wicketkeeper';
    } else if (p.role === 'Top Order' || p.role === 'Middle Order') {
        draftCategory = 'Batter';
    } else if (p.role === 'Finisher') {
        if (exceptions.some(e => p.name.includes(e))) {
            draftCategory = 'All-rounder';
        } else {
            draftCategory = 'Batter';
        }
    } else if (p.role === 'Spinner' || p.role === 'Pacer') {
        if (exceptions.some(e => p.name.includes(e))) {
            draftCategory = 'All-rounder';
        } else {
            draftCategory = 'Bowler';
        }
    } else if (p.role === 'All-rounder') {
        draftCategory = 'All-rounder';
    }
    
    return { ...p, draftCategory };
});

const fileContent = `import { Player } from '../types';

export const PLAYERS: Player[] = ${JSON.stringify(updatedPlayers, null, 2)};
`;

fs.writeFileSync('./src/data/players.ts', fileContent, 'utf-8');
console.log('Successfully updated players.ts with draftCategory');
