const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST } = require('discord.js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Slur tracking system
const slurTrackingChannelId = '1394531964039729162'; // Your specific channel ID
const userSlurCounts = new Map(); // Stores { userId: { count: number, slurs: [] } }

// Map of base slurs to their variants
const SLUR_VARIANTS = {
    'nigga': ['nigga', 'nigger', 'nigg@', '(ni)gga', '(n)igga', 'n-igga', 'ni-gga', 'nig-ga', 'nigg-a', 'nigga-', '-nigga', 'NIGGA', 'Nigga', 'niggA', 'niGGa', 'NigGa', 'NiGGa'],
    'beaner': ['beaner', 'be@ner'],
    'retard': ['retard'],
    // Add other mappings similarly
};


// List of blacklisted words (case insensitive)
const BLACKLISTED_WORDS = [
    'nigga', 'nigger', 'nigg@', 'beaner', 'be@ner', '(ni)gga', '(n)igga',
    'n-igga', 'ni-gga', 'nig-ga', 'nigg-a', 'nigga-', 'retard', '-nigga',
    'niggar', 'NIGGA', 'Nigga', 'niggA', 'niGGa', 'NigGa', 'NiGGa',
    "anal", "anus", "arse", "ballsack", "bastard", "bitch", "btch", "biatch",
    "blowjob", "bollock", "bollok", "boob", "bugger", "butt", "choad", "clitoris",
    "cock", "coon", "crap", "dick", "dildo", "douchebag", "dyke", "fag", "feck",
    "fellate", "fellatio", "felching", "fudgepacker", "flange", "gtfo", "hoe",
    "horny", "incest", "jizz", "labia", "masturbat", "muff", "naked", "nazi",
    "niggu", "nipple", "nips", "nude", "pedophile", "penis", "porn", "prick",
    "prostitut", "pube", "pussie", "pussy", "queer", "rape", "rapist", "retard",
    "rimjob", "scrotum", "sex", "slut", "spunk", "suckmy", "tits", "tittie",
    "titty", "turd", "twat", "vagina", "wank", "whore", "kys", "kus", "kysu",
    "kysy", "kysys", "kysyu", "kysyus", "cuck", "whigga", "chigga", "slave"
    // Add more words as needed
];

// Character replacements for obfuscation detection
const DEFAULT_CHARACTER_REPLACEMENTS = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 'l',
    '$': 's', '!': 'i', '+': 't', '#': 'h', '@': 'a', '<': 'c',
    '-': ' ', '_': ' ', '|': ' ', '.': ' ', ',': ' ', '(': ' ',
    ')': ' ', '>': ' ', '"': ' ', '`': ' ', '~': ' ', '*': ' ',
    '&': ' ', '%': ' ', '?': ' '
};

// Function to normalize text by replacing characters and removing spaces
function normalizeText(text) {
    let normalized = text.toLowerCase();
    for (const [char, replacement] of Object.entries(DEFAULT_CHARACTER_REPLACEMENTS)) {
        normalized = normalized.split(char).join(replacement);
    }
    return normalized.replace(/\s+/g, '');
}

// Function to check if message contains blacklisted words
function containsBlacklistedWord(message) {
    const normalizedMessage = normalizeText(message);
    return BLACKLISTED_WORDS.some(word => 
        normalizedMessage.includes(normalizeText(word))
    );
}

// Function to get detected slurs from a message
function getDetectedSlurs(message) {
    const normalizedMessage = normalizeText(message);
    const detectedBaseSlurs = [];

    for (const [base, variants] of Object.entries(SLUR_VARIANTS)) {
        for (const variant of variants) {
            if (normalizedMessage.includes(normalizeText(variant))) {
                detectedBaseSlurs.push(base);
                break; // Prevent counting multiple variants of same base slur
            }
        }
    }

    return detectedBaseSlurs;
}


// Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('tops')
        .setDescription('Shows the top slur offenders')
        .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const detectedSlurs = getDetectedSlurs(message.content);
    console.log(`Detected slurs: ${detectedSlurs.join(', ')}`);

    if (detectedSlurs.length > 0) {
        try {
            await message.delete();
            console.log(`Deleted message from ${message.author.tag}`);

            const timeoutDuration = 5 * 60 * 1000;
            if (message.member.moderatable && message.member.kickable) {
                await message.member.timeout(timeoutDuration, 'Used blacklisted word');
                console.log(`Timed out ${message.author.tag} for 5 minutes`);
            } else {
                console.log(`Cannot timeout ${message.author.tag}, insufficient permissions or role hierarchy issue`);
            }

            const userId = message.author.id;
            const userData = userSlurCounts.get(userId) || { count: 0, slurs: [] };
            userData.count += detectedSlurs.length;
            userData.slurs.push(...detectedSlurs.map(s => s.toLowerCase()));
            userSlurCounts.set(userId, userData);

            // Send public warning
            const publicWarning = await message.channel.send(
                `${message.author} said a slur and now has a streak of ${userData.count} for saying bad words.`
            );
            console.log(`Sent public warning for ${message.author.tag}`);

            setTimeout(() => publicWarning.delete().catch(console.error), 10000);

            // Send detailed info to tracking channel
            const trackingChannel = await client.channels.fetch(slurTrackingChannelId);
            if (trackingChannel) {
                await trackingChannel.send(
                    `🚨 **Slur Detected** 🚨\n` +
                    `User: ${message.author.tag} (${message.author.id})\n` +
                    `Total Slurs: ${userData.count}\n` +
                    `Recent Slurs: ${detectedSlurs.join(', ')}\n` +
                    `All Unique Slurs Used: ${[...new Set(userData.slurs)].join(', ')}`
                );
                console.log(`Logged slur to tracking channel`);
            }

        } catch (error) {
            console.error('Error handling blacklisted word:', error);
        }
    }
});


// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'tops') {
        try {
            const sortedUsers = Array.from(userSlurCounts.entries())
                .map(([userId, data]) => ({
                    userId,
                    count: data.count,
                    slurs: [...new Set(data.slurs)]
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10); // Top 10

            if (sortedUsers.length === 0) {
                await interaction.reply('No slurs have been detected yet.');
                return;
            }

            const leaderboard = sortedUsers.map((user, index) => {
                try {
                    const member = interaction.guild.members.cache.get(user.userId);
                    const username = member ? member.user.tag : `Unknown User (${user.userId})`;
                    return `**${index + 1}.** ${username} - ${user.count} slurs (${user.slurs.slice(0, 5).join(', ')}${user.slurs.length > 5 ? '...' : ''})`;
                } catch (error) {
                    console.error('Error processing user:', error);
                    return `**${index + 1}.** Error loading user data`;
                }
            }).join('\n');

            await interaction.reply({
                embeds: [{
                    title: '🏆 Top Slur Offenders 🏆',
                    description: leaderboard,
                    color: 0xFF0000,
                    footer: { text: 'Automatically tracked by the slur detection system' },
                    timestamp: new Date()
                }]
            });
        } catch (error) {
            console.error('Error generating leaderboard:', error);
            await interaction.reply('An error occurred while generating the leaderboard.');
        }
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
