  // ================= IMPORTURI =================
  const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionsBitField } = require("discord.js");
  const fetch = require("node-fetch");
  const express = require("express");

  // ================= EXPRESS KEEP ALIVE (web service) =================
  const app = express();
  const PORT = process.env.PORT || 3000;
  app.get("/", (req, res) => res.send("Bot is alive ✅"));
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  // ================= DISCORD CLIENT =================
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  const OWNER_ID = "1510663071109218315";
  const TICKET_CATEGORY = "1541617031877759158";
  const WELCOME_CHANNEL_ID = "1541639164645085294";
  const COMMANDS_CHANNEL_ID = "1541611176679706684";
  const NO_RESTRICTION_CHANNEL_ID = "1541611176679706684";

  const SUPPORT_ROLES = ["1537258495181717584", "1534027552178307222"];
  const PURGE_ROLES = ["1559338974512676914", "1525381427393204245", "1525381607786287154"];

  // ================= PROTECTED !help MESSAGE =================
  const PROTECTED_MESSAGE_ID = "1541639991640203324";

  // ================= BANNERE =================
  const STATS_GIF = "https://www.animatedimages.org/data/media/562/animated-line-image-0104.gif";
  const TICKET_BANNER = "https://i.imgur.com/s76Heec.gif";
  const PURGE_BANNERS = "https://i.imgur.com/Me12n15.gif";
  const FUCK_GIFS = ["https://cdn.hentaigifz.com/84966/bounce-bounce.gif", "https://cdn.hentaigifz.com/88822/mankitsu-happening.gif"];
  const WELCOME_BANNER = "https://i.imgur.com/sZ95zTx.gif";
  const TICKET_CREATED = "https://i.imgur.com/O5p96dZ.gif";

  // ================= UTILS =================
  function formatNumber(num) { return num ? num.toLocaleString() : "0"; }

  async function fetchWithTimeout(url, timeout = 20000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try { return await fetch(url, { signal: controller.signal }); } 
    finally { clearTimeout(id); }
  }

  function getRandomPurge() { return PURGE_BANNERS; }
  function getRandomFuck() { return FUCK_GIFS[Math.floor(Math.random() * FUCK_GIFS.length)]; }
  function getRandomUnhook() { return PURGE_BANNERS; }

  function hasStaffPermission(member) {
    if (member.id === OWNER_ID) return true;
    return member.roles.cache.some(role => PURGE_ROLES.includes(role.id));
  }

  const giveaways = new Map();
  const MAX_GIVEAWAY_DURATION = 30 * 24 * 60 * 60 * 1000;

  function parseGiveawayDuration(value) {
    const durationPattern = /(\d+)([smhd])/g;
    let duration = 0;
    let match;
    let parsed = "";
    while ((match = durationPattern.exec(value.toLowerCase())) !== null) {
      parsed += match[0];
      const amount = Number(match[1]);
      const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
      duration += amount * unit;
    }
    if (parsed !== value.toLowerCase() || duration < 60_000 || duration > MAX_GIVEAWAY_DURATION) return null;
    return duration;
  }

  function scheduleGiveawayEnd(giveaway) {
    const remaining = giveaway.endsAt - Date.now();
    const maxTimeout = 2_147_000_000;
    setTimeout(() => {
      if (Date.now() < giveaway.endsAt) scheduleGiveawayEnd(giveaway);
      else finishGiveaway(giveaway.id);
    }, Math.min(remaining, maxTimeout));
  }

  async function finishGiveaway(giveawayId) {
    const giveaway = giveaways.get(giveawayId);
    if (!giveaway || giveaway.ended) return;
    giveaway.ended = true;

    const entrants = [...giveaway.entrants];
    const winners = [];
    while (entrants.length > 0 && winners.length < giveaway.winnerCount) {
      winners.push(entrants.splice(Math.floor(Math.random() * entrants.length), 1)[0]);
    }

    const winnerText = winners.length
      ? winners.map(id => `<@${id}>`).join(", ")
      : "No valid entries, so there are no winners.";
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("🎉 Giveaway Ended")
      .setDescription(`**Prize:** ${giveaway.prize}\n**Winner${winners.length === 1 ? "" : "s"}:** ${winnerText}\n**Entries:** ${giveaway.entrants.size}`)
      .setTimestamp();

    const channel = giveaway.channel;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) {
      await message.edit({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`giveaway_join:${giveawayId}`).setLabel("Giveaway Ended").setStyle(ButtonStyle.Secondary).setDisabled(true)
        )]
      }).catch(() => null);
      await channel.send({ content: winnerText, allowedMentions: { users: winners } }).catch(() => null);
    }
  }

  // ================= VERIFICARE CANAL COMENZI =================
  function isCommandsChannel(channelId) {
    return channelId === COMMANDS_CHANNEL_ID;
  }

  function isNoRestrictionChannel(channelId) {
    return channelId === NO_RESTRICTION_CHANNEL_ID;
  }

  // ================= ANTI-RAID + OWNER BYPASS =================
  const userMessageMap = new Map();

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const member = message.member;
    if (!member) return;
    const botAvatar = client.user.displayAvatarURL({ dynamic: true });

    const isNoRestriction = isNoRestrictionChannel(message.channel.id);

    if (message.author.id !== OWNER_ID && !isNoRestriction) {
      const userData = userMessageMap.get(message.author.id) || { count: 0, timer: null, lastMessage: Date.now() };
      userData.count += 1;
      if (Date.now() - userData.lastMessage < 1000) userData.count += 3;
      if (!userData.timer) userData.timer = setTimeout(() => userMessageMap.delete(message.author.id), 15000);
      userMessageMap.set(message.author.id, { ...userData, lastMessage: Date.now() });

      if (userData.count > 8) {
        await member.timeout(20 * 60 * 1000, "Raid/Spam").catch(() => null);
        await message.delete().catch(() => null);
        const embed = new EmbedBuilder().setColor(0x000000).setTitle("Timed out!").setDescription("Stop raiding/spamming.").setThumbnail(botAvatar);
        await message.author.send({ embeds: [embed] }).catch(() => null);
        return;
      }

      const linkRegex = /(https?:\/\/|discord\.gg|discordapp\.com\/invite|bit\.ly|tinyurl|short\.link|youtu\.be|twitch\.tv)/i;
      if (linkRegex.test(message.content)) {
        await message.delete().catch(() => null);
        await member.timeout(15 * 60 * 1000, "Link - anti-raid").catch(() => null);
        const embed = new EmbedBuilder().setColor(0x000000).setTitle("Links forbidden").setDescription("Any link = timeout.").setThumbnail(botAvatar);
        await message.author.send({ embeds: [embed] }).catch(() => null);
        return;
      }

      if (/injuries/i.test(message.content)) {
        await member.timeout(10 * 60 * 1000).catch(() => null);
        await message.delete().catch(() => null);
        const embed = new EmbedBuilder().setColor(0x000000).setTitle("Timed out").setDescription("Stop 'injuries'.").setThumbnail(botAvatar);
        await message.author.send({ embeds: [embed] }).catch(() => null);
        return;
      }
    }

    if (isNoRestriction) {
      const content = message.content.toLowerCase();
      if (content.includes('discord.gg/') || content.includes('logged.tg/auth')) {
        await message.delete().catch(() => null);
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle("❌ Link Blocked!")
          .setDescription("You can't send server invites or auth links here!")
          .setFooter({ text: `Requested by ${message.author.username}` });
        await message.channel.send({ embeds: [embed] }).then(msg => {
          setTimeout(() => msg.delete().catch(() => null), 5000);
        }).catch(() => null);
        return;
      }
    }

    const isCommand = message.content.startsWith("!") && 
      (message.content.startsWith("!stats") || 
      message.content.startsWith("!purge") || 
      message.content.startsWith("!giveaway") ||
      message.content.startsWith("!fuck") || 
      message.content.startsWith("!unhook") || 
      message.content.startsWith("!help") || 
      message.content.startsWith("!check") || 
      message.content.startsWith("!create_ticket_panel"));

    if (isCommand && !isCommandsChannel(message.channel.id) && message.author.id !== OWNER_ID) {
      await message.delete().catch(() => null);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle("❌ Wrong Channel!")
        .setDescription(`Don't try using commands here r3tard go to\n<#${COMMANDS_CHANNEL_ID}>`)
        .setFooter({ text: `Requested by ${message.author.username}` });
      
      await message.channel.send({ embeds: [errorEmbed] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => null), 5000);
      }).catch(() => null);
      return;
    }

    const targetUser = message.mentions.users.first() || message.author;
    const targetId = targetUser.id;

    // !giveaway <duration> <winner count> <prize> (staff only)
    if (message.content.startsWith("!giveaway")) {
      if (!hasStaffPermission(member)) {
        return message.reply("❌ You don't have permission to use this command.");
      }

      const args = message.content.trim().split(/\s+/);
      if (args[1]?.toLowerCase() === "end") {
        const entry = [...giveaways.entries()].find(([, giveaway]) => giveaway.messageId === args[2]);
        if (!entry || entry[1].ended) return message.reply("❌ Active giveaway not found. Use its giveaway message ID.");
        await finishGiveaway(entry[0]);
        return;
      }

      const duration = parseGiveawayDuration(args[1] || "");
      const winnerCount = Number(args[2]);
      const prize = args.slice(3).join(" ").trim();
      if (!duration || !Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20 || !prize) {
        return message.reply("Usage: `!giveaway <duration> <winner count> <prize>` (example: `!giveaway 1h 1 Nitro`)\nTo end early: `!giveaway end <giveaway message ID>`. Duration: 1m–30d.");
      }

      const endsAt = Date.now() + duration;
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle("🎉 Giveaway")
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n**Entries:** 0\n\nClick the button below to enter!`)
        .setFooter({ text: `Hosted by ${message.author.username}` })
        .setTimestamp(endsAt);
      const giveawayId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const giveaway = {
        id: giveawayId,
        channel: message.channel,
        messageId: null,
        prize,
        winnerCount,
        endsAt,
        entrants: new Set(),
        ended: false
      };
      const giveawayMessage = await message.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_join:${giveawayId}`)
            .setLabel("Join Giveaway")
            .setEmoji("🎉")
            .setStyle(ButtonStyle.Success)
        )]
      });
      giveaway.messageId = giveawayMessage.id;
      giveaways.set(giveawayId, giveaway);
      scheduleGiveawayEnd(giveaway);
      await message.reply(`✅ Giveaway started. Message ID: \`${giveawayMessage.id}\`\nEnd early with: \`!giveaway end ${giveawayMessage.id}\``);
      return;
    }

    // !stats
    if (message.content.startsWith("!stats")) {
      if (targetId === "1510663071109218315") {
        const embed1 = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`— <a:1463658185901608991:1532590641681404035>INJURIES STATS —`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setDescription(
            `**USER:** \`${targetUser.username}\`\n\n` +
            `<a:cross101:1532582407054688388>**TOTAL STATS**\n` +
            `\`\`\`Hits:     1,228\nVisits:   2,244\nClicks:   3,459\`\`\`\n\n` +
            `<a:cross101:1532582407054688388>**BIGGEST HITS**\n` +
            `\`\`\`Summary:  552.33k\nRAP:      112.76k\nRobux:    68.23k\`\`\`\n\n` +
            `<a:cross101:1532582407054688388>**TOTAL HIT STATS**\n` +
            `\`\`\`Summary:  3.4m\nRAP:      522.6k\nRobux:    448.88k\`\`\``
          )
          .setImage(STATS_GIF)
          .setFooter({ text: `STERAX • Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        const embed2 = new EmbedBuilder()
          .setColor(0x000000)
          .setImage("https://i.imgur.com/l6IkrrC.gif")

        await message.channel.send({
          embeds: [embed1, embed2],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel("View User")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${targetId}`)
            )
          ]
        });
        return;
      }

      try {
        const res = await fetchWithTimeout(`https://api.injuries.to/v1/public/user?userId=${targetId}`);
        const data = await res.json();
        if (!data.success || !data.Normal) return message.reply("❌ No stats found.");

        const normal = data.Normal;
        const profile = data.Profile || {};
        const userName = profile.userName || targetUser.username;

        const totalHits = normal.TotalHits || normal.AllTime || normal.Totals || {};
        const totalSummary = totalHits.Summary || normal.Highest?.Summary || 0;
        const totalRap = totalHits.Rap || normal.Highest?.Rap || 0;
        const totalRobux = totalHits.Balance || normal.Highest?.Balance || 0;

        const embed1 = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`— <a:1463658185901608991:1532590641681404035>INJURIES STATS —`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setDescription(
            `**USER:** \`${userName}\`\n\n` +
            `<a:cross101:1532582407054688388>**TOTAL STATS**\n` +
            `\`\`\`Hits:     ${formatNumber(normal.Totals?.Accounts)}\nVisits:   ${formatNumber(normal.Totals?.Visits)}\nClicks:   ${formatNumber(normal.Totals?.Clicks)}\`\`\`\n\n` +
            `<a:cross101:1532582407054688388>**BIGGEST HITS**\n` +
            `\`\`\`Summary:  ${formatNumber(normal.Highest?.Summary)}\nRAP:      ${formatNumber(normal.Highest?.Rap)}\nRobux:    ${formatNumber(normal.Highest?.Balance)}\`\`\`\n\n` +
            `<a:cross101:1532582407054688388>**TOTAL HIT STATS**\n` +
            `\`\`\`Summary:  ${formatNumber(totalSummary)}\nRAP:      ${formatNumber(totalRap)}\nRobux:    ${formatNumber(totalRobux)}\`\`\``
          )
          .setImage(STATS_GIF)
          .setFooter({ text: ` • Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        const embed2 = new EmbedBuilder()
          .setColor(0x000000)
          .setImage("https://i.imgur.com/l6IkrrC.gif");

        await message.channel.send({
          embeds: [embed1, embed2],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel("View User")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${targetId}`)
            )
          ]
        });
      } catch (err) { console.error(err); message.reply("❌ API timeout.").catch(() => null); }
    }

    // !purge
    if (message.content.startsWith("!purge")) {
      if (!hasStaffPermission(member)) {
        return message.reply("❌ You don't have permission to use this command.");
      }

      try {
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        const deleted = await message.channel.bulkDelete(fetched, true);
        const embed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle("Successfully purged")
          .setDescription(`Deleted ${deleted.size} messages`)
          .setImage(getRandomPurge())
          .setFooter({ text: "STERAX • Purge" });
        await message.channel.send({ embeds: [embed] });
      } catch (e) {
        message.reply("Purge failed.").catch(() => null);
      }
    }

    // !fuck
    if (message.content.startsWith("!fuck")) {
      const mention = message.mentions.users.first();
      if (!mention) return message.reply("❌ Mention a user!");
      
      if (mention.id === OWNER_ID) {
        return message.reply("You can't fuck owner go fuck yourself!💔🥀");
      }
      
      if (message.author.id === "1505715261087678635") {
        return message.reply("U can't fuck nobody everyone broke yo ahh💔🥀");
      }
      
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x000000).setTitle(`Fucking ${mention.username}`).setDescription(`<@${mention.id}>`).setImage(getRandomFuck()).setFooter({ text: `Requested by ${message.author.username}` })] });
    }

    // !unhook
    if (message.content.startsWith("!unhook")) {
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle("— <a:why:1545850214064193576> UNHOOK TUTORIAL —")
        .setDescription(`If your beams do not say **"INJURIES"** then you might be losing your beams.\nWatch the video below.`)
        .setImage("https://i.imgur.com/8IgDbSB.gif");
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("unhook_video").setLabel("Unhook").setStyle(ButtonStyle.Secondary));
      await message.channel.send({ embeds: [embed], components: [row] });
    }

    // !help
    if (message.content.startsWith("!help")) {
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle("— <a:why:1545850214064193576> HELP MENU —")
        .setDescription(
          `**Available Commands:**\n\n` +
          `**!stats [@user]**\n` +
          `Provides the full stats of a user (hits, visits, clicks, biggest hits, RAP, Robux etc.)\n\n` +
          `**!fuck @user**\n` +
          `Sends a funny GIF message to the mentioned user.\n\n` +
          `**!purge**\n` +
          `(Owner + Staff) Deletes the last 100 messages in the current channel.\n\n` +
          `**!giveaway <duration> <winners> <prize>**\n` +
          `(Owner + Staff) Starts a giveaway (example: !giveaway 1h 1 Nitro). Use !giveaway end <message ID> to end it early.\n\n` +
          `**!unhook**\n` +
          `Shows the unhook tutorial for beams (if beams don't say "INJURIES").\n\n` +
          `**!check**\n` +
          `Checks if the website is online/offline + browser compatibility (Chrome, Firefox, Opera etc.).\n\n` +
          `**!create_ticket_panel**\n` +
          `(Owner + Staff) Creates the ticket selection panel.`
        )
        .setImage("https://i.imgur.com/y2D15VM.gif")
        .setFooter({ text: `Requested by ${message.author.username}` });
      await message.channel.send({ embeds: [embed] });
    }

    // !create_ticket_panel
    if (message.content.startsWith("!create_ticket_panel")) {
      if (!hasStaffPermission(member)) {
        return message.reply("❌ You don't have permission to use this command.");
      }

      const embedMain = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`—— <a:1463658185901608991:1532590641681404035>ꜱᴜᴘᴘᴏʀᴛ  ——`)
        .setDescription(`<a:1463658185901608991:1532590641681404035>ᴘʟᴇᴀꜱᴇ ᴄʜᴏᴏꜱᴇ ᴀ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴅᴇᴘᴇɴᴅɪɴɢ ᴏɴ ᴡʜᴀᴛ ᴛʏᴘᴇ ᴏꜰ ɪꜱꜱᴜᴇ ʏᴏᴜʀ ᴅᴇᴀʟɪɴɢ ᴡɪᴛʜ`)
        .setImage(TICKET_BANNER);

      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_select")
          .setPlaceholder("Select Ticket Type")
          .addOptions([
            {
              label: "Links",
              value: "links",
              emoji: { id: "1532590641681404035", name: "1463658185901608991", animated: true }
            },
            {
              label: "Generator",
              value: "generator",
              emoji: { id: "1532582407054688388", name: "cross101", animated: true }
            },
            {
              label: "Others",
              value: "others",
              emoji: { id: "1532590616150671491", name: "1532377228237603057", animated: true }
            }
          ])
      );

      await message.channel.send({ embeds: [embedMain], components: [selectMenu] });
    }

    // !check
    if (message.content.startsWith("!check")) {
      const checkingMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x000000).setDescription("**Fetching status...**")] });

      try {
        const start = Date.now();
        const res = await fetchWithTimeout("https://www.logged.tg/dashboard", 15000);
        const latency = Date.now() - start;

        if (res.ok) {
          const onlineEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setAuthor({ name: "Injuries Status", iconURL: "https://cdn3.emoji.gg/emojis/49198-online1.gif" })
            .setTitle("Injuries are online")
            .setThumbnail("https://cdn3.emoji.gg/emojis/49198-online1.gif")
            .setDescription(
              `<:wow_nasa:1541662507373170688> **Response:** ${latency}ms\n` +
              `<:low_intern:1541662473881526372> **Status Code:** ${res.status}\n\n` +
              `**Browser Compatibility**\n` +
              `<:krum:1541662436069744660><:correct_ka:1541662393707528202>\n` +
              `<:fireyes:1541662544362733700><:correct_ka:1541662393707528202>\n` +
              `<:ibang_opera:1541662652785369188><:correct_ka:1541662393707528202>\n` +
              `<:upera:1541662616949358744><:correct_ka:1541662393707528202>\n` +
              `<:huwow:1541662585227579442><:correct_ka:1541662393707528202>`
            )
            .setImage("https://i.imgur.com/3YXGyCC.gif")
            .setFooter({ text: `Requested by ${message.author.username}` });

          await checkingMsg.edit({ embeds: [onlineEmbed] });
        } else throw new Error("Not OK");
      } catch (err) {
        const offlineEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setAuthor({ name: "Injuries Status", iconURL: "https://cdn3.emoji.gg/emojis/9596-offline.gif" })
          .setTitle("<:1528433695957192744:1541665384292417546>injuries offline")
          .setThumbnail("https://cdn3.emoji.gg/emojis/9596-offline.gif")
          .setDescription(`**Error:** Timeout\n**Unable to fetch from API**`)
          .setImage("https://i.imgur.com/2g1Sknf.gif")
          .setFooter({ text: `Requested by ${message.author.username}` });

        await checkingMsg.edit({ embeds: [offlineEmbed] });
      }
      return;
    }
  });

  // ================= WELCOME SYSTEM =================
  client.on("guildMemberAdd", async (member) => {
    try {
      const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
      
      // Server welcome
      if (welcomeChannel) {
        const welcomeMain = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`<a:why:1545850214064193576> Welcome to STERAX!!`)
          .setDescription(
            `Read\n` +
            `<#1525376533277970433>\n\n` +
            `<#1526217490374459452>\n\n` +
            `Remember to verify!!\n` +
            `<#1525382322629902366>`
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setImage(WELCOME_BANNER);

        await welcomeChannel.send({
          content: `<@${member.id}> has joined the server!`,
          embeds: [welcomeMain]
        });
      }

      // DM welcome (silent try)
      const dmEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle("Welcome to STERAX")
        .setDescription(
          `**${member.user.username}**\n\n` +
          `If your hits do not say \`INJURIES\`\n` +
          `Make sure you use \`!unhook\` command in the channel cmds\n\n` +
          `And don’t forget to verify to gain access to all channels`
        )
        .setImage(WELCOME_BANNER)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

      await member.send({ embeds: [dmEmbed] }).catch(() => null);

    } catch (err) {
      console.error("Welcome error:", err);
    }
  });

  // ================= INTERACTIONS =================
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith("giveaway_join:")) {
      const giveawayId = interaction.customId.slice("giveaway_join:".length);
      const giveaway = giveaways.get(giveawayId);
      if (!giveaway || giveaway.ended || Date.now() >= giveaway.endsAt) {
        if (giveaway && !giveaway.ended) await finishGiveaway(giveawayId);
        return interaction.reply({ content: "This giveaway has ended.", ephemeral: true });
      }

      if (giveaway.entrants.has(interaction.user.id)) {
        return interaction.reply({ content: "You're already entered in this giveaway.", ephemeral: true });
      }

      giveaway.entrants.add(interaction.user.id);
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      updatedEmbed.setDescription(updatedEmbed.data.description.replace(/\*\*Entries:\*\* \d+/, `**Entries:** ${giveaway.entrants.size}`));
      await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => null);
      return interaction.reply({ content: "✅ You're entered in the giveaway!", ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      const type = interaction.values[0];
      const member = interaction.member;
      const guild = interaction.guild;
      const channelName = `${member.user.username}-${type}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

      if (guild.channels.cache.find(c => c.name === channelName)) {
        return interaction.reply({ content: `You already have a ticket: #${channelName}`, ephemeral: true });
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          ...SUPPORT_ROLES.map(r => ({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });

      const ticketMain = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`— <a:1463658185901608991:1532590641681404035> TICKET CREATED —`)
        .setDescription(
          `**Welcome** <@${member.id}> !\n\n` +
          `Please describe what type of issue you have.\n` +
          `Staff will be with you shortly.`
        )
        .setImage(TICKET_CREATED);

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({
        embeds: [ticketMain],
        components: [closeButton]
      });

      const supportMentions = SUPPORT_ROLES.map(roleId => `<@&${roleId}>`).join(' ');
      await ticketChannel.send({
        content: `${supportMentions}`
      });
    }

    if (interaction.isButton() && interaction.customId === "unhook_video") {
      await interaction.reply({ content: "**Video:**\nhttps://streamable.com/c8zglf" });
    }
    if (interaction.isButton() && interaction.customId === "close_ticket") {
      await interaction.channel.delete().catch(() => null);
    }
  });

  // ================= AUTO-PURGE =================
  async function autoPurge() {
    try {
      console.log("🔄 Auto-purge starting...");
      for (const guild of client.guilds.cache.values()) {
        for (const channelId of ["1541611176679706684"]) {
          if (channelId === COMMANDS_CHANNEL_ID) continue;
          const channel = guild.channels.cache.get(channelId);
          if (channel?.isTextBased()) {
            let fetched;
            let totalDeleted = 0;
            let hasMore = true;
            
            while (hasMore) {
              try {
                fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!fetched || fetched.size === 0) {
                  hasMore = false;
                  break;
                }
                
                const toDelete = fetched.filter(m => m.id !== PROTECTED_MESSAGE_ID);
                if (toDelete.size > 0) {
                  await channel.bulkDelete(toDelete, true).catch(() => null);
                  totalDeleted += toDelete.size;
                  console.log(`🗑️ Deleted ${toDelete.size} messages in ${channel.name} (Total: ${totalDeleted})`);
                }
                
                if (fetched.size < 100) {
                  hasMore = false;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (err) {
                console.error("Error in auto-purge batch:", err);
                hasMore = false;
              }
            }
            
            if (totalDeleted > 0) {
              console.log(`✅ Auto-purge completed: Deleted ${totalDeleted} messages total in ${channel.name}`);
            } else {
              console.log(`ℹ️ No messages to delete in ${channel.name}`);
            }
          }
        }
      }
    } catch (err) { 
      console.error("❌ Auto-purge error:", err); 
    }
  }

  setInterval(autoPurge, 24 * 60 * 60 * 1000);
  setTimeout(autoPurge, 5000);

  // LOGIN
  client.login(TOKEN).then(() => console.log(`Logged in as ${client.user.tag}`));
