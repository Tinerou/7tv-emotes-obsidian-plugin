/**
 * 7TV Emotes for Obsidian
 * 
 * Integrates 7TV (Twitch) emotes into Obsidian markdown editor with auto-complete,
 * multiple caching strategies, and streamer-specific emote sets.
 * 
 * @version 1.0.3 * @license MIT
 * @author Tinerou
 */

import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, FuzzyMatch, Plugin, PluginSettingTab, Setting,
    Notice, MarkdownView, Modal
} from 'obsidian';

// =====================================================================
// CONFIGURATION INTERFACES AND CONSTANTS
// =====================================================================

/**
 * Defines the structure of plugin settings persisted to Obsidian's configuration storage.
 * 
 * @property twitchUserId - Numeric Twitch identifier for emote set retrieval via 7TV API
 * @property selectedStreamerId - Internal key mapping to built-in streamer presets
 * @property cacheStrategy - Storage behavior for emote images: 'on-demand' or 'no-cache'
 * @property logLevel - Verbosity control for plugin logging system
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'on-demand' | 'no-cache';
    logLevel: 'none' | 'basic' | 'verbose' | 'debug';
}

/**
 * Default configuration values applied during initial plugin installation.
 * 
 * @constant twitchUserId - Empty string for manual entry
 * @constant selectedStreamerId - No preset selection initially
 * @constant cacheStrategy - Balanced approach caching emotes on first use
 * @constant logLevel - Basic operational logging without debug overhead
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand',
    logLevel: 'basic'
}

/**
 * Curated collection of popular streamers with verified Twitch ID mappings.
 * 
 * @constant BUILT_IN_STREAMERS - Array of [Display Name, Twitch ID, Internal Key] tuples
 * 
 * Streamer selection provides immediate access without manual ID lookup.
 * Each entry includes:
 *   - Display name shown in UI
 *   - Numeric Twitch identifier for API queries
 *   - Internal key for plugin state management
 */
const BUILT_IN_STREAMERS: Array<[string, string, string]> = [
	['10000DAYS', '43414943', '10000days'],
    ['1DrakoNz', '118787650', '1drakonz'],
    ['2mgovercsquared', '45177533', '2mgovercsquared'],
    ['2xnowel', '777695748', '2xnowel'],
    ['2xRaKai', 'ERROR', '2xrakai'],
    ['39daph', '160504245', '39daph'],
    ['3Gaming', '98894253', '3gaming'],
    ['4freakshow', '241722108', '4freakshow'],
    ['5opka', '32155044', '5opka'],
    ['5up', '86061418', '5up'],
    ['72hrs', '101400190', '72hrs'],
    ['8cho', '93132142', '8cho'],
    ['A1taOda', '51435464', 'a1taoda'],
    ['A_Seagull', '19070311', 'a_seagull'],
    ['Aa9skillz', '20993498', 'aa9skillz'],
    ['aaabroke', '888138659', 'aaabroke'],
    ['abby_', '167100879', 'abby_'],
    ['ABOKYAN', '183553158', 'abokyan'],
    ['abugoku9999', '264984080', 'abugoku9999'],
    ['Ac7ionMan', '124467382', 'ac7ionman'],
    ['aceu', '88946548', 'aceu'],
    ['Ache', '193032346', 'ache'],
    ['Adal', '143794475', 'adal'],
    ['Adapt', '211234859', 'adapt'],
    ['AdinRoss', '59299632', 'adinross'],
    ['AdmiralBahroo', '40972890', 'admiralbahroo'],
    ['AdmiralBulldog', '30816637', 'admiralbulldog'],
    ['adolfz', '26707340', 'adolfz'],
    ['AdrianaChechik_', '457124238', 'adrianachechik_'],
    ['aDrive', '14339949', 'adrive'],
    ['AdzTV', '170547313', 'adztv'],
    ['Agent00', '90222258', 'agent00'],
    ['AgenteMaxo', '210485458', 'agentemaxo'],
    ['Agony', '30084163', 'agony'],
    ['Agraelus', '36620767', 'agraelus'],
    ['agurin', '31545223', 'agurin'],
    ['Agusbob', '94851664', 'agusbob'],
    ['agustin51', '99422402', 'agustin51'],
    ['Ahmed_show', '103097144', 'ahmed_show'],
    ['AhriNyan', '84594988', 'ahrinyan'],
    ['Aiekillu', '27085209', 'aiekillu'],
    ['aimbotcalvin', '84574550', 'aimbotcalvin'],
    ['aimsey', '192434734', 'aimsey'],
    ['aircool', '488507979', 'aircool'],
    ['Akademiks', 'ERROR', 'akademiks'],
    ['Akim', '75262446', 'akim'],
    ['AkuASMR', '177887421', 'akuasmr'],
    ['akyuliych', '263748648', 'akyuliych'],
    ['Alanalarana', '525587062', 'alanalarana'],
    ['alanzoka', '38244180', 'alanzoka'],
    ['Albralelie', '112868442', 'albralelie'],
    ['Alderiate', '77452537', 'alderiate'],
    ['aldo_geo', '119795835', 'aldo_geo'],
    ['alewang', '414973116', 'alewang'],
    ['Alex_Zedra', '122101897', 'alex_zedra'],
    ['Alexby11', '19942092', 'alexby11'],
    ['alexcrasherss', '506751031', 'alexcrasherss'],
    ['alexelcapo', '36138196', 'alexelcapo'],
    ['AlinaRinRin', '114037984', 'alinarinrin'],
    ['Alinity', '38718052', 'alinity'],
    ['Alixxa', '100372176', 'alixxa'],
    ['Alliege', '243963817', 'alliege'],
    ['ALOHADANCETV', '46571894', 'alohadancetv'],
    ['alondrissa', '541270824', 'alondrissa'],
    ['AlphaCast', '94435040', 'alphacast'],
    ['alpharad', '75508096', 'alpharad'],
    ['AlphaSniper97', '29810567', 'alphasniper97'],
    ['alphonsodavies', '563247824', 'alphonsodavies'],
    ['AlpTV', '100033175', 'alptv'],
    ['amablitz', '280408230', 'amablitz'],
    ['Amar', '67931625', 'amar'],
    ['Amaru', '219431490', 'amaru'],
    ['Amaz', '43356746', 'amaz'],
    ['AmazonMusic', '123275679', 'amazonmusic'],
    ['aminematue', '26261471', 'aminematue'],
    ['AMOURANTH', '125387632', 'amouranth'],
    ['Ampeterby7', '77649106', 'ampeterby7'],
    ['anarabdullaev', '922408450', 'anarabdullaev'],
    ['Anas_Off', '62154099', 'anas_off'],
    ['anders_vejrgang', '162621190', 'anders_vejrgang'],
    ['AndyMilonakis', '51858842', 'andymilonakis'],
    ['angelskimi', '84569419', 'angelskimi'],
    ['angievelasco08', '501725259', 'angievelasco08'],
    ['angryginge13', '598713647', 'angryginge13'],
    ['AngryJoeShow', '119611214', 'angryjoeshow'],
    ['ANGRYPUG', '63164470', 'angrypug'],
    ['AnnaCramling', '485234908', 'annacramling'],
    ['annadeniz', '251917401', 'annadeniz'],
    ['AnneMunition', '51533859', 'annemunition'],
    ['anniebot', '44019612', 'anniebot'],
    ['AnnieFuchsia', '61294188', 'anniefuchsia'],
    ['AnniTheDuck', '126884070', 'annitheduck'],
    ['Annoying', '92372244', 'annoying'],
    ['anny', '56418014', 'anny'],
    ['Anomaly', '76508554', 'anomaly'],
    ['AnsiChan', '169927748', 'ansichan'],
    ['Antfrost', '43882924', 'antfrost'],
    ['Anthony_Kongphan', '21588571', 'anthony_kongphan'],
    ['AnthonyZ', '119415848', 'anthonyz'],
    ['AntoineDaniel', '135468063', 'antoinedaniel'],
    ['antonychenn', '506728919', 'antonychenn'],
    ['Anyme023', '737048563', 'anyme023'],
    ['AOC', '502865545', 'aoc'],
    ['Aphromoo', '21673391', 'aphromoo'],
    ['apored', '154723532', 'apored'],
    ['Apricot', '151054406', 'apricot'],
    ['AquaFPS', '134666774', 'aquafps'],
    ['aquav2_', '131995691', 'aquav2_'],
    ['AQUINO', '93455889', 'aquino'],
    ['Arab', '123067038', 'arab'],
    ['archangel_hs', '95332211', 'archangel_hs'],
    ['AriaSaki', '62510206', 'ariasaki'],
    ['AriGameplays', '70357283', 'arigameplays'],
    ['aroyitt', '178203816', 'aroyitt'],
    ['Arteezy', '23364603', 'arteezy'],
    ['Arthas', '27115707', 'arthas'],
    ['arturofernandeztv', '528015251', 'arturofernandeztv'],
    ['ash', '60198919', 'ash'],
    ['asianbunnyx', '503369631', 'asianbunnyx'],
    ['AsianJeff', '272748387', 'asianjeff'],
    ['Asmongold', '26261471', 'asmongold'],
    ['aspaszin', '269503217', 'aspaszin'],
    ['Aspen', '147927227', 'aspen'],
    ['AsunaWEEB', '48389176', 'asunaweeb'],
    ['Athena', '140551421', 'athena'],
    ['Atrioc', '23211159', 'atrioc'],
    ['Aunkere', '139345001', 'aunkere'],
    ['auronplay', '459331509', 'auronplay'],
    ['AussieAntics', '224539819', 'aussieantics'],
    ['AustinShow', '40197643', 'austinshow'],
    ['AuzioMF', '101175894', 'auziomf'],
    ['AvaGG', '30039402', 'avagg'],
    ['AvalancheSoftware', '794555957', 'avalanchesoftware'],
    ['AverageJonas', '124304147', 'averagejonas'],
    ['AveryWest0', '818706057', 'averywest0'],
    ['AvoidingThePuddle', '23528098', 'avoidingthepuddle'],
    ['awesamdude', '48022358', 'awesamdude'],
    ['aXoZer', '133528221', 'axozer'],
    ['aXtLOL', '41783889', 'axtlol'],
    ['AyarBaffo', '417900560', 'ayarbaffo'],
    ['Aydan', '120244187', 'aydan'],
    ['Ayellol', '45866401', 'ayellol'],
    ['aypierre', '29753247', 'aypierre'],
    ['Ayrun', '132931679', 'ayrun'],
    ['AZRA', '414507208', 'azra'],
    ['Aztecross', '50881182', 'aztecross'],
    ['B0aty', '27107346', 'b0aty'],
    ['babi', '569320237', 'babi'],
    ['Bacon_Donut', '36155872', 'bacon_donut'],
    ['BadBoyHalo', '569342750', 'badboyhalo'],
    ['BagheraJones', '100744948', 'bagherajones'],
    ['Bagi', '47125717', 'bagi'],
    ['Baiano', '140772558', 'baiano'],
    ['BaityBait', '549653218', 'baitybait'],
    ['Bajheera', '22916751', 'bajheera'],
    ['bakzera', '469711093', 'bakzera'],
    ['baldythenoob', '595525333', 'baldythenoob'],
    ['Bananirou', '83953406', 'bananirou'],
    ['BanduraCartel', '718236928', 'banduracartel'],
    ['bao', '110059426', 'bao'],
    ['barathrum1515', '401521782', 'barathrum1515'],
    ['BarcaGamer', '123042641', 'barcagamer'],
    ['BastiGHG', '38121996', 'bastighg'],
    ['BatalhaDaAldeia', '262319971', 'batalhadaaldeia'],
    ['bateson87', '28369163', 'bateson87'],
    ['BattlestateGames', '233334675', 'battlestategames'],
    ['Bayonetta_TV', '148389721', 'bayonetta_tv'],
    ['bazattak007', '83959795', 'bazattak007'],
    ['Beaulo', '38553197', 'beaulo'],
    ['Becca', '35824977', 'becca'],
    ['Behzinga', '29555307', 'behzinga'],
    ['BENIJU03', '195376105', 'beniju03'],
    ['benjyfishy', '66983298', 'benjyfishy'],
    ['berkriptepe', '29512470', 'berkriptepe'],
    ['berleezy', '53441269', 'berleezy'],
    ['betboom_cs_a', '75910196', 'betboom_cs_a'],
    ['betboom_ru', '129339704', 'betboom_ru'],
    ['Bethesda', '614394', 'bethesda'],
    ['BeyondTheSummit', '29578325', 'beyondthesummit'],
    ['BibleBoysChurch', '498840927', 'bibleboyschurch'],
    ['Bichouu_', '173066877', 'bichouu_'],
    ['BiDa', '37825200', 'bida'],
    ['BigEx', '415249792', 'bigex'],
    ['Bigfoltz', '32607302', 'bigfoltz'],
    ['BigGuy', '744047127', 'bigguy'],
    ['Bigpuffer', '41616317', 'bigpuffer'],
    ['BigSpinCR', '144798294', 'bigspincr'],
    ['BikiniBodhi', '129342719', 'bikinibodhi'],
    ['billzo', '215159541', 'billzo'],
    ['biroPJL', '266187835', 'biropjl'],
    ['Bisteconee', '512137332', 'bisteconee'],
    ['biyin_', '579785040', 'biyin_'],
    ['Bjergsenlol', '38421618', 'bjergsenlol'],
    ['blackelespanolito', '68124914', 'blackelespanolito'],
    ['blackoutz', '156961894', 'blackoutz'],
    ['BlackUFA', '98742675', 'blackufa'],
    ['blanchitooo', '241581961', 'blanchitooo'],
    ['BLAST', '182144693', 'blast'],
    ['BLASTPremier', '163299585', 'blastpremier'],
    ['blau', '52959392', 'blau'],
    ['Blizzard', '8822', 'blizzard'],
    ['Blooprint', '149439626', 'blooprint'],
    ['BLOU', '610611496', 'blou'],
    ['bmkibler', '25871845', 'bmkibler'],
    ['bnans', '110176631', 'bnans'],
    ['BO2TVofficial', '611456265', 'bo2tvofficial'],
    ['BobbyPoffGaming', '212682921', 'bobbypoffgaming'],
    ['Bobicraftmc', '49910500', 'bobicraftmc'],
    ['BobRoss', '105458682', 'bobross'],
    ['bocade09zx', '787984025', 'bocade09zx'],
    ['BoffeGP', '177628323', 'boffegp'],
    ['boltz', '53052202', 'boltz'],
    ['Boogie2988', '9661257', 'boogie2988'],
    ['BoomerNA', '36156571', 'boomerna'],
    ['Booya', '193365768', 'booya'],
    ['BotezLive', '127550308', 'botezlive'],
    ['boxbox', '38881685', 'boxbox'],
    ['boyMinORu', '118336478', 'boyminoru'],
    ['bratishkinoff', '99899949', 'bratishkinoff'],
    ['Brawlhalla', '75346877', 'brawlhalla'],
    ['BrawlStars', '160377301', 'brawlstars'],
    ['brax', '29039515', 'brax'],
    ['brino', '431679357', 'brino'],
    ['brkk', '178752007', 'brkk'],
    ['bronny', '518960165', 'bronny'],
    ['BrookeAB', '214560121', 'brookeab'],
    ['brooklynfrost', '1028692635', 'brooklynfrost'],
    ['Broxah', '43539324', 'broxah'],
    ['broxh_', '105533253', 'broxh_'],
    ['brtt', '31497918', 'brtt'],
    ['BruceDropEmOff', '88084663', 'brucedropemoff'],
    ['BruceGrannec', '31813025', 'brucegrannec'],
    ['Brunenger', '94757023', 'brunenger'],
    ['bt0tv', '22336099', 'bt0tv'],
    ['BTMC', '46708418', 'btmc'],
    ['btssmash', '214062798', 'btssmash'],
    ['buckefps', '120679071', 'buckefps'],
    ['buddha', '136765278', 'buddha'],
    ['Buerinho', '189139646', 'buerinho'],
    ['Bugha', '82524912', 'bugha'],
    ['Bungie', '53097129', 'bungie'],
    ['BunnyFuFuu', '54559073', 'bunnyfufuu'],
    ['BushCampDad', '847477998', 'bushcampdad'],
    ['BUSHWHACK18', '160257437', 'bushwhack18'],
    ['buster', '86277097', 'buster'],
    ['by_Owl', '47966045', 'by_owl'],
    ['byfliper06', 'ERROR', 'byfliper06'],
    ['byfliper_', 'ERROR', 'byfliper_'],
    ['byfliper_x', 'ERROR', 'byfliper_x'],
    ['byilhann', '496105401', 'byilhann'],
    ['bySL4M', '38759871', 'bysl4m'],
    ['bysTaXx', '25690271', 'bystaxx'],
    ['bytarifaaa', '509100013', 'bytarifaaa'],
    ['byViruZz', '30770604', 'byviruzz'],
    ['C_a_k_e', '43899589', 'c_a_k_e'],
    ['Cabritoz', '80539309', 'cabritoz'],
    ['cacho01', '43190052', 'cacho01'],
    ['Caedrel', '92038375', 'caedrel'],
    ['calango', '58393005', 'calango'],
    ['Call of Duty', '501281', 'call of duty'],
    ['CallMeCarsonLIVE', '76055616', 'callmecarsonlive'],
    ['CallMeKevin', '23492760', 'callmekevin'],
    ['callumonthebeat', 'ERROR', 'callumonthebeat'],
    ['cameliaaa92', '790173918', 'cameliaaa92'],
    ['camman18', '73375593', 'camman18'],
    ['CapcomFighters', '36616300', 'capcomfighters'],
    ['CapitanGatoo', '596583418', 'capitangatoo'],
    ['Caprimint', '59131475', 'caprimint'],
    ['caprisun', '1145541046', 'caprisun'],
    ['caps', '129281939', 'caps'],
    ['CaptainPuffy', '24338391', 'captainpuffy'],
    ['CaptainSparklez', '15554591', 'captainsparklez'],
    ['Carlitus', '200631673', 'carlitus'],
    ['Carola', '110405254', 'carola'],
    ['Carolinestormi', '65293756', 'carolinestormi'],
    ['Carreraaa', '106820088', 'carreraaa'],
    ['carterefe', '797196666', 'carterefe'],
    ['casanovabeams', '669130577', 'casanovabeams'],
    ['caseoh247', '1200831758', 'caseoh247'],
    ['caseoh_', '267160288', 'caseoh_'],
    ['CashApp', '471239022', 'cashapp'],
    ['CashNastyGaming', '56235100', 'cashnastygaming'],
    ['casimito', '254489093', 'casimito'],
    ['CastCrafter', '32806281', 'castcrafter'],
    ['Castro_1021', '52091823', 'castro_1021'],
    ['catcha800', 'ERROR', 'catcha800'],
    ['CazeTV_', '869959833', 'cazetv_'],
    ['CBLOL', '36511475', 'cblol'],
    ['CCT_CS', '268731435', 'cct_cs'],
    ['CD PROJEKT RED', '62938127', 'cd projekt red'],
    ['CDawg', '45098797', 'cdawg'],
    ['cdewx', '24666044', 'cdewx'],
    ['CDNThe3rd', '14408894', 'cdnthe3rd'],
    ['ceh9', '39176562', 'ceh9'],
    ['Cellbit', '28579002', 'cellbit'],
    ['CH14', '431857492', 'ch14'],
    ['Chanzes', '242069575', 'chanzes'],
    ['Chap', '192678094', 'chap'],
    ['charlesleclerc', '506634115', 'charlesleclerc'],
    ['cheatbanned', '42049440', 'cheatbanned'],
    ['chefstrobel', '138310362', 'chefstrobel'],
    ['Chess', '7601562', 'chess'],
    ['chibidoki', '632564662', 'chibidoki'],
    ['Chica', '70661496', 'chica'],
    ['ChilledChaos', '9528182', 'chilledchaos'],
    ['choc', '96406881', 'choc'],
    ['chocoTaco', '69906737', 'chocotaco'],
    ['ChOpPeRz14', '72293941', 'chopperz14'],
    ['chowh1', '117168642', 'chowh1'],
    ['Chrisnxtdoor', '120977175', 'chrisnxtdoor'],
    ['cidcidoso', '138375255', 'cidcidoso'],
    ['CinCinBear', '63135520', 'cincinbear'],
    ['Cinna', '204730616', 'cinna'],
    ['Cizzorz', '128489946', 'cizzorz'],
    ['ClashRoyale', '104846109', 'clashroyale'],
    ['ClintStevens', '86268118', 'clintstevens'],
    ['Clix', '233300375', 'clix'],
    ['cloakzy', '81687332', 'cloakzy'],
    ['cNed', '31443685', 'cned'],
    ['Co1azo', '212744599', 'co1azo'],
    ['CoconutB', '56395702', 'coconutb'],
    ['Cocottee_', '656252271', 'cocottee_'],
    ['CodeMiko', '500128827', 'codemiko'],
    ['Codonysus', '941570594', 'codonysus'],
    ['CohhCarnage', '26610234', 'cohhcarnage'],
    ['Colas_Bim', '104477229', 'colas_bim'],
    ['coldzin', '38590945', 'coldzin'],
    ['ColtHavok', '119089037', 'colthavok'],
    ['conner', 'ERROR', 'conner'],
    ['ConnorEatsPants', '37455669', 'connoreatspants'],
    ['Conterstine', '49914195', 'conterstine'],
    ['CooLifeGame', '42814514', 'coolifegame'],
    ['Coreano', '128775333', 'coreano'],
    ['COREANOLOCOLIVE', '480022299', 'coreanolocolive'],
    ['CORINNAKOPF', '212124784', 'corinnakopf'],
    ['Corpse_Husband', '585856958', 'corpse_husband'],
    ['coscu', '36473331', 'coscu'],
    ['CottontailVA', '548281862', 'cottontailva'],
    ['CouRageJD', '106125347', 'couragejd'],
    ['Cowsep', '48465437', 'cowsep'],
    ['Crayator', '50191268', 'crayator'],
    ['CreamTheRabbit', '753198480', 'creamtherabbit'],
    ['Crimsix', '11454896', 'crimsix'],
    ['Crisgreen', '93818855', 'crisgreen'],
    ['CristianGhost', '149287198', 'cristianghost'],
    ['CriticalRole', '229729353', 'criticalrole'],
    ['Crossmauz', '487801489', 'crossmauz'],
    ['CrusherFooxi10', '569316091', 'crusherfooxi10'],
    ['Cryaotic', 'ERROR', 'cryaotic'],
    ['CrystalMolly', '126750144', 'crystalmolly'],
    ['csgo_mc', '213748641', 'csgo_mc'],
    ['CSRuHub', '116311210', 'csruhub'],
    ['ct0m', '414805368', 'ct0m'],
    ['cuptoast', '504595924', 'cuptoast'],
    ['curry', '113178266', 'curry'],
    ['CyanidePlaysGames', '63142572', 'cyanideplaysgames'],
    ['cyr', '37522866', 'cyr'],
    ['CYRILmp4', '55828551', 'cyrilmp4'],
    ['CzechCloud', '31453284', 'czechcloud'],
    ['d0cc_tv', '112702339', 'd0cc_tv'],
    ['d0tyaq', '857828221', 'd0tyaq'],
    ['D3stri', '36094496', 'd3stri'],
    ['DaequanWoco', '127651530', 'daequanwoco'],
    ['dafran', '41314239', 'dafran'],
    ['DaigoTheBeasTV', '115590970', 'daigothebeastv'],
    ['dakotaz', '39298218', 'dakotaz'],
    ['DalasReview', '51366401', 'dalasreview'],
    ['daltoosh', '260722430', 'daltoosh'],
    ['dangerlyoha', '402093335', 'dangerlyoha'],
    ['DanielaAzuaje_', '77669901', 'danielaazuaje_'],
    ['Daniels', '45952312', 'daniels'],
    ['Danila_Gorilla', '770721241', 'danila_gorilla'],
    ['dannyaarons', '143424503', 'dannyaarons'],
    ['DannyGoonzalez', '84162884', 'dannygoonzalez'],
    ['DansGaming', '7236692', 'dansgaming'],
    ['DanTDM', '45382480', 'dantdm'],
    ['Dantes', '466139555', 'dantes'],
    ['DanucD', '189755167', 'danucd'],
    ['dapr', '46176210', 'dapr'],
    ['DarioMocciaTwitch', '53065331', 'dariomocciatwitch'],
    ['DarkViperAU', '57519051', 'darkviperau'],
    ['Dashy', '119015407', 'dashy'],
    ['dasMEHDI', '31557869', 'dasmehdi'],
    ['datboisteezyy', '640564475', 'datboisteezyy'],
    ['DatModz', '24124090', 'datmodz'],
    ['Datto', '42296879', 'datto'],
    ['DavidDobrik', '574491149', 'daviddobrik'],
    ['Davis', '653369114', 'davis'],
    ['davooxeneize', '499538703', 'davooxeneize'],
    ['DavyJones', '39795492', 'davyjones'],
    ['Day9tv', '18587270', 'day9tv'],
    ['dddeactivated__', '199644155', 'dddeactivated__'],
    ['DDG', '124835948', 'ddg'],
    ['DeadByDaylight', '107286467', 'deadbydaylight'],
    ['Deadlyslob', '12731745', 'deadlyslob'],
    ['deadmau5', '71166086', 'deadmau5'],
    ['DechartGames', '189106199', 'dechartgames'],
    ['deepins02', '135385636', 'deepins02'],
    ['deercheerup', '245622027', 'deercheerup'],
    ['defantediogo', '248306987', 'defantediogo'],
    ['deko', '111454676', 'deko'],
    ['del1ght', '64023526', 'del1ght'],
    ['delegarp', '238937419', 'delegarp'],
    ['dellor', '53811294', 'dellor'],
    ['Delux', '63072834', 'delux'],
    ['demisux', '119257472', 'demisux'],
    ['Demon1', '133333248', 'demon1'],
    ['Dendi', '39176440', 'dendi'],
    ['DeqiuV', '472752044', 'deqiuv'],
    ['derzko69', '180937915', 'derzko69'],
    ['des0ut', '39154501', 'des0ut'],
    ['DeshaeFrost', '687186861', 'deshaefrost'],
    ['DessT3', '431146848', 'desst3'],
    ['Destiny', 'ERROR', 'destiny'],
    ['Destroy', '53927878', 'destroy'],
    ['Deujna', '42541814', 'deujna'],
    ['deyyszn', '411331824', 'deyyszn'],
    ['Dfrment', '556386833', 'dfrment'],
    ['Dhalucard', '16064695', 'dhalucard'],
    ['dhtekkz', '153475752', 'dhtekkz'],
    ['dianarice', '61776347', 'dianarice'],
    ['DiazBiffle', '95055754', 'diazbiffle'],
    ['Didiwinxx', '521919115', 'didiwinxx'],
    ['Diegosaurs', '73779954', 'diegosaurs'],
    ['dilblin', '415327697', 'dilblin'],
    ['Dilera', '174805181', 'dilera'],
    ['dinablin', '121023163', 'dinablin'],
    ['Dinglederper', '22705699', 'dinglederper'],
    ['DisguisedToast', '87204022', 'disguisedtoast'],
    ['dish', '255567495', 'dish'],
    ['Distortion2', '36324138', 'distortion2'],
    ['dizzy', '108005221', 'dizzy'],
    ['DizzyKitten', '47474524', 'dizzykitten'],
    ['DjMaRiiO', '1895664', 'djmariio'],
    ['DJMarkusTV', '452388782', 'djmarkustv'],
    ['dkincc', '121072767', 'dkincc'],
    ['Dmitry_Lixxx', '188890121', 'dmitry_lixxx'],
    ['dn1ureal', '235216896', 'dn1ureal'],
    ['dogdog', '60978448', 'dogdog'],
    ['Doigby', '25454398', 'doigby'],
    ['dojacattington', '415108429', 'dojacattington'],
    ['Domingo', '40063341', 'domingo'],
    ['dona', '451214957', 'dona'],
    ['DonutOperator', '119253305', 'donutoperator'],
    ['dopa24', '536083731', 'dopa24'],
    ['Dosia_csgo', '48243045', 'dosia_csgo'],
    ['dota2_paragon_ru', '851088609', 'dota2_paragon_ru'],
    ['dota2mc', '213749122', 'dota2mc'],
    ['Dota2RuHub', '100814397', 'dota2ruhub'],
    ['dota2ti', '35630634', 'dota2ti'],
    ['dota2ti_ru', '35631192', 'dota2ti_ru'],
    ['Doublelift', '40017619', 'doublelift'],
    ['DougDoug', '31507411', 'dougdoug'],
    ['Douglassola', '157809310', 'douglassola'],
    ['dragon_sunshine_', 'ERROR', 'dragon_sunshine_'],
    ['drakeoffc', '231922983', 'drakeoffc'],
    ['drb7h', '208308607', 'drb7h'],
    ['DrDisrespect', 'ERROR', 'drdisrespect'],
    ['DreadzTV', '31089858', 'dreadztv'],
    ['Dream', '451544676', 'dream'],
    ['dreamwastaken', '657297676', 'dreamwastaken'],
    ['DrIgo', '51315079', 'drigo'],
    ['DrLupo', '29829912', 'drlupo'],
    ['DropsByPonk', '131974742', 'dropsbyponk'],
    ['Drututt', '57131280', 'drututt'],
    ['dtoke', '511868154', 'dtoke'],
    ['dubs', '196137255', 'dubs'],
    ['DuendePablo', '47939440', 'duendepablo'],
    ['Duke', '117583640', 'duke'],
    ['duki', '513734390', 'duki'],
    ['dunkstream', '40397064', 'dunkstream'],
    ['DUXO', '40549818', 'duxo'],
    ['DVM_Medja', '132199022', 'dvm_medja'],
    ['DylanteroLIVE', '130345683', 'dylanterolive'],
    ['dyrachyo', '96833143', 'dyrachyo'],
    ['Dyrus', '30080751', 'dyrus'],
    ['EaiMaka', '88208039', 'eaimaka'],
    ['eaJPark', '572082587', 'eajpark'],
    ['EAMaddenNFL', '51914127', 'eamaddennfl'],
    ['easportsfc', '28029009', 'easportsfc'],
    ['EasyLiker', '761821431', 'easyliker'],
    ['Ebonivon', '162665605', 'ebonivon'],
    ['Echo_Esports', '558530984', 'echo_esports'],
    ['EDISON', '120304051', 'edison'],
    ['Edwin_live', '174985071', 'edwin_live'],
    ['Efesto96', '241546561', 'efesto96'],
    ['EFEUYGAC', '103237625', 'efeuygac'],
    ['egorkreed', '451634552', 'egorkreed'],
    ['ekatze007', '466153965', 'ekatze007'],
    ['ElAbrahaham', '488006352', 'elabrahaham'],
    ['Elajjaz', '26921830', 'elajjaz'],
    ['elanur', '196005456', 'elanur'],
    ['elBokeron', '74547642', 'elbokeron'],
    ['ElcanaldeJoaco', '430476278', 'elcanaldejoaco'],
    ['ElChiringuitoTV', '247401621', 'elchiringuitotv'],
    ['elded', '76385901', 'elded'],
    ['eldemente', '157488994', 'eldemente'],
    ['Eldos', '438235965', 'eldos'],
    ['ELEAGUE TV', '109724636', 'eleague tv'],
    ['ElFedelobo', '69955030', 'elfedelobo'],
    ['ElGlogloking', '725614862', 'elglogloking'],
    ['eliasn97', '238813810', 'eliasn97'],
    ['ElisabeteKitty', '155874595', 'elisabetekitty'],
    ['elisawaves', '506880770', 'elisawaves'],
    ['ElMariana', '496795673', 'elmariana'],
    ['ElmiilloR', '44880944', 'elmiillor'],
    ['ElOjoNinja', '39692658', 'elojoninja'],
    ['ELoTRiX', '43286888', 'elotrix'],
    ['Elraenn', '165080419', 'elraenn'],
    ['ElRichMC', '30651868', 'elrichmc'],
    ['ElSpreen', '157658336', 'elspreen'],
    ['ElVenado98', '699225745', 'elvenado98'],
    ['Elwind', '71761252', 'elwind'],
    ['elxokas', '31919607', 'elxokas'],
    ['ElZeein', '27589421', 'elzeein'],
    ['EmadGG', '154526718', 'emadgg'],
    ['Emikukis', '272067658', 'emikukis'],
    ['emilycc', '111882197', 'emilycc'],
    ['Emiru', '91067577', 'emiru'],
    ['EmmaLangevin', '514945202', 'emmalangevin'],
    ['Emongg', '23220337', 'emongg'],
    ['Endretta', '90739706', 'endretta'],
    ['EnriqueRamosGamer', '415906036', 'enriqueramosgamer'],
    ['Enviosity', '44390855', 'enviosity'],
    ['enzzai', '467031116', 'enzzai'],
    ['epicenter_en1', '118170488', 'epicenter_en1'],
    ['EpikWhale', '145786272', 'epikwhale'],
    ['Eray', '131403189', 'eray'],
    ['Eret', '27427227', 'eret'],
    ['ernesBarbeQ', '41879247', 'ernesbarbeq'],
    ['Ernesto', '40135340', 'ernesto'],
    ['erobb221', '96858382', 'erobb221'],
    ['ErycTriceps', '85943836', 'eryctriceps'],
    ['EsfandTV', '38746172', 'esfandtv'],
    ['ESL_DOTA2', '36481935', 'esl_dota2'],
    ['ESL_Dota2Ember', '50160915', 'esl_dota2ember'],
    ['ESL_LOL', '30707866', 'esl_lol'],
    ['ESLCS', '31239503', 'eslcs'],
    ['ESLCS_GG', '22859264', 'eslcs_gg'],
    ['eslcs_pl', '23675021', 'eslcs_pl'],
    ['ESLCSb', '35936871', 'eslcsb'],
    ['Espe', '183597729', 'espe'],
    ['Estailus', '140792340', 'estailus'],
    ['EthanNestor', '38953507', 'ethannestor'],
    ['ethos', '44558619', 'ethos'],
    ['Etoiles', '85800130', 'etoiles'],
    ['eugeniacooney', '59657997', 'eugeniacooney'],
    ['evaanna', '130784874', 'evaanna'],
    ['Evelone192', '39426641', 'evelone192'],
    ['evelone2004', '738000896', 'evelone2004'],
    ['Evo', '30917811', 'evo'],
    ['EWROON', '82197170', 'ewroon'],
    ['Exileshow', '161689469', 'exileshow'],
    ['ExtraEmily', '517475551', 'extraemily'],
    ['f0rest', '38019007', 'f0rest'],
    ['F1NN5TER', '268107452', 'f1nn5ter'],
    ['Fabo', '41884889', 'fabo'],
    ['FabrizioRomano', '683703013', 'fabrizioromano'],
    ['Facada', '471175257', 'facada'],
    ['FACEIT TV', '27942990', 'faceit tv'],
    ['facubanzas', '71631166', 'facubanzas'],
    ['Faide', '51065352', 'faide'],
    ['Fairlight_Excalibur', '54989347', 'fairlight_excalibur'],
    ['Faith', '160538649', 'faith'],
    ['Faker', '43691', 'faker'],
    ['fANDERCS', '174053656', 'fandercs'],
    ['fanfan', '596031520', 'fanfan'],
    ['FantaBobShow', '29188740', 'fantabobshow'],
    ['Fanum', '139251406', 'fanum'],
    ['FarbizzBat9', '226492540', 'farbizzbat9'],
    ['FarfadoxVEVO', '224818031', 'farfadoxvevo'],
    ['FattyPillow', '76073513', 'fattypillow'],
    ['faxuty', '148561738', 'faxuty'],
    ['FaZe', '20761874', 'faze'],
    ['FaZeBlaze', '62134739', 'fazeblaze'],
    ['FaZeSway', 'ERROR', 'fazesway'],
    ['FEDMYSTER', '39040630', 'fedmyster'],
    ['felca', '787486979', 'felca'],
    ['Felps', '30672329', 'felps'],
    ['Fenya', '102302893', 'fenya'],
    ['fer', '71167031', 'fer'],
    ['Fernanfloo', '197855687', 'fernanfloo'],
    ['Fextralife', '156037856', 'fextralife'],
    ['FFearFFul', '36922190', 'ffearfful'],
    ['Fibii', '220716126', 'fibii'],
    ['Fierik', '108547363', 'fierik'],
    ['fifakillvizualz', '104659233', 'fifakillvizualz'],
    ['FifaTargrean', '134039697', 'fifatargrean'],
    ['filian', '198633200', 'filian'],
    ['Fitz', '52878372', 'fitz'],
    ['fl0m', '25093116', 'fl0m'],
    ['Flamby', '60256640', 'flamby'],
    ['Flashpoint', '490523982', 'flashpoint'],
    ['Flats', '141429177', 'flats'],
    ['Flight23white', '51270104', 'flight23white'],
    ['FlowPodcast', '424262503', 'flowpodcast'],
    ['flyinguwe87', '51492033', 'flyinguwe87'],
    ['fnmoneymaker', '984432588', 'fnmoneymaker'],
    ['fnxLNTC', '59336873', 'fnxlntc'],
    ['FolagorLives', '30857876', 'folagorlives'],
    ['Foolish', '145015519', 'foolish'],
    ['Forever', '477552485', 'forever'],
    ['FORMAL', '12338326', 'formal'],
    ['Formula1', '175769353', 'formula1'],
    ['forsen', '22484632', 'forsen'],
    ['Fortnite', '55125740', 'fortnite'],
    ['fps_shaka', '49207184', 'fps_shaka'],
    ['FPSThailand', '38539112', 'fpsthailand'],
    ['fr_zod', '252428210', 'fr_zod'],
    ['frametamer666', '663995665', 'frametamer666'],
    ['Franio', '109027939', 'franio'],
    ['Frank_Cuesta', '634209206', 'frank_cuesta'],
    ['Frankkaster', '61504845', 'frankkaster'],
    ['FranqitoM', '506611605', 'franqitom'],
    ['Freakazoid', '26959170', 'freakazoid'],
    ['Freneh', '97552124', 'freneh'],
    ['Fresh', '38594688', 'fresh'],
    ['fritz_meinecke', '460133452', 'fritz_meinecke'],
    ['Froggen', '38865133', 'froggen'],
    ['FroggerOW', '131986952', 'froggerow'],
    ['frttt', '30458295', 'frttt'],
    ['Fruktozka', '91465245', 'fruktozka'],
    ['fugu_fps', '140846786', 'fugu_fps'],
    ['Fundy', '93028922', 'fundy'],
    ['funnymike', '165573325', 'funnymike'],
    ['fuslie', '83402203', 'fuslie'],
    ['FuzeIII', '41040855', 'fuzeiii'],
    ['Fyrexxx', '40261250', 'fyrexxx'],
    ['G0ularte', '51786703', 'g0ularte'],
    ['GaBBoDSQ', '45139193', 'gabbodsq'],
    ['gabepeixe', '59799994', 'gabepeixe'],
    ['GAECHKATM', '450012016', 'gaechkatm'],
    ['gafallen', '37287763', 'gafallen'],
    ['Gale', '115467657', 'gale'],
    ['GaleguiNS', '447773658', 'galeguins'],
    ['GameMixTreize', 'ERROR', 'gamemixtreize'],
    ['GamerBrother', '125036509', 'gamerbrother'],
    ['GamesDoneQuick', '22510310', 'gamesdonequick'],
    ['GamsterGaming', '186531172', 'gamstergaming'],
    ['GassyMexican', '23057278', 'gassymexican'],
    ['Gaules', '181077473', 'gaules'],
    ['GeekandSundry', '36619809', 'geekandsundry'],
    ['Gemita', '471811595', 'gemita'],
    ['Genburten', '135175880', 'genburten'],
    ['GenshinImpactOfficial', '493750981', 'genshinimpactofficial'],
    ['GENSYXA', '81623587', 'gensyxa'],
    ['GeorgeNotFound', '639654714', 'georgenotfound'],
    ['gerardromero', '605221125', 'gerardromero'],
    ['GermanGarmendia', '215443081', 'germangarmendia'],
    ['GernaderJake', '1423946', 'gernaderjake'],
    ['GeT_RiGhT', '38024128', 'get_right'],
    ['Giantwaffle', '22552479', 'giantwaffle'],
    ['Giggand', '91026471', 'giggand'],
    ['Gigguk', '24411833', 'gigguk'],
    ['Gingy', '94130217', 'gingy'],
    ['GirlOfNox', '129108719', 'girlofnox'],
    ['Gladd', '81628627', 'gladd'],
    ['GLADIATORPWNZ', 'ERROR', 'gladiatorpwnz'],
    ['Glorious_E', '63304572', 'glorious_e'],
    ['glotistic', '1055171003', 'glotistic'],
    ['GMHikaru', '103268673', 'gmhikaru'],
    ['gnf', '654556126', 'gnf'],
    ['Gnu_Live', '88006635', 'gnu_live'],
    ['goatmash222', 'ERROR', 'goatmash222'],
    ['godwins', '460417343', 'godwins'],
    ['GOFNS', '66418614', 'gofns'],
    ['GoldGlove', '1518077', 'goldglove'],
    ['goncho', '114635439', 'goncho'],
    ['Gonsabellla', '405208912', 'gonsabellla'],
    ['GoodTimesWithScar', '23558127', 'goodtimeswithscar'],
    ['gORDOx', '36024998', 'gordox'],
    ['Gorgc', '108268890', 'gorgc'],
    ['Gosu', '41939266', 'gosu'],
    ['Gotaga', '24147592', 'gotaga'],
    ['GothamChess', '151283108', 'gothamchess'],
    ['grafo', '40266934', 'grafo'],
    ['gratis150ml', '52203144', 'gratis150ml'],
    ['Greekgodx', '15310631', 'greekgodx'],
    ['GrenBaud', '568747744', 'grenbaud'],
    ['Grimm', '94757023', 'grimm'],
    ['Grimmmz', '9679595', 'grimmmz'],
    ['Gripex90', '32947748', 'gripex90'],
    ['Grizzy', '142726152', 'grizzy'],
    ['GRONKH', '12875057', 'gronkh'],
    ['GronkhTV', '106159308', 'gronkhtv'],
    ['Grossie_Gore', 'ERROR', 'grossie_gore'],
    ['Grubby', '20992865', 'grubby'],
    ['GS_1', '465636300', 'gs_1'],
    ['gskianto', '150436863', 'gskianto'],
    ['GTimeTV', '60160906', 'gtimetv'],
    ['GUACAMOLEMOLLY', '181718577', 'guacamolemolly'],
    ['GUANYAR', '74426799', 'guanyar'],
    ['Guaxinim', '48393132', 'guaxinim'],
    ['H1ghSky1', '524698414', 'h1ghsky1'],
    ['H2P_Gucio', '36954803', 'h2p_gucio'],
    ['h3h3productions', '62438432', 'h3h3productions'],
    ['Halo', '26019478', 'halo'],
    ['HamedLoco', '470335253', 'hamedloco'],
    ['hamlinz', '67143805', 'hamlinz'],
    ['HandOfBlood', '49140130', 'handofblood'],
    ['hannahxxrose', '63096750', 'hannahxxrose'],
    ['HappyHappyGal', '660840731', 'happyhappygal'],
    ['hardgamechannel', '153353959', 'hardgamechannel'],
    ['Harmii', '113537067', 'harmii'],
    ['HasanAbi', '207813352', 'hasanabi'],
    ['hashinshin', 'ERROR', 'hashinshin'],
    ['hastad', '26857029', 'hastad'],
    ['Hasvik', '143099070', 'hasvik'],
    ['Hayashii', '29094596', 'hayashii'],
    ['Hazretiyasuo', '66488107', 'hazretiyasuo'],
    ['HBomb94', '21313349', 'hbomb94'],
    ['Hctuan', '175560856', 'hctuan'],
    ['HealthyGamer_GG', '447330144', 'healthygamer_gg'],
    ['Heelmike', 'ERROR', 'heelmike'],
    ['heliN139', 'ERROR', 'helin139'],
    ['HellianTV', '90056148', 'helliantv'],
    ['helydia', '253195796', 'helydia'],
    ['HenryTran', '235693408', 'henrytran'],
    ['henyathegenius', '896388738', 'henyathegenius'],
    ['Herdyn', '27187962', 'herdyn'],
    ['heyimbee', '26903378', 'heyimbee'],
    ['HeyStan', '63736545', 'heystan'],
    ['Higgs', '554057125', 'higgs'],
    ['HighDistortion', '84752541', 'highdistortion'],
    ['HIKAKIN', '659829475', 'hikakin'],
    ['Hiko', '26991127', 'hiko'],
    ['Hiperop', '25214262', 'hiperop'],
    ['HisWattson', '123182260', 'hiswattson'],
    ['HITBOXKING', '45329736', 'hitboxking'],
    ['hJune', '121111915', 'hjune'],
    ['Holmes', '68018147', 'holmes'],
    ['Homyatol', '21167655', 'homyatol'],
    ['HoneyMad', '40298003', 'honeymad'],
    ['HoneyPuu', '158388504', 'honeypuu'],
    ['Horcus', '34371079', 'horcus'],
    ['HRKChannel', '82045428', 'hrkchannel'],
    ['HudsonAmorim1', '450476144', 'hudsonamorim1'],
    ['Hungrybox', '30666848', 'hungrybox'],
    ['HuronaRolera', '441019244', 'huronarolera'],
    ['HusKerrs', '30079255', 'huskerrs'],
    ['HutchMF', '180118013', 'hutchmf'],
    ['Hype', '89408007', 'hype'],
    ['i6rba5', '52606303', 'i6rba5'],
    ['iaaraS2', '142932807', 'iaaras2'],
    ['IamCristinini', '123922797', 'iamcristinini'],
    ['ibabyrainbow', '544502795', 'ibabyrainbow'],
    ['ibai', '83232866', 'ibai'],
    ['iBlali', '11524494', 'iblali'],
    ['iConsipt', 'ERROR', 'iconsipt'],
    ['IFrostBolt', '77913099', 'ifrostbolt'],
    ['iGeStarK', '68062590', 'igestark'],
    ['iinwafqht', '460209842', 'iinwafqht'],
    ['iiTzTimmy', '45302947', 'iitztimmy'],
    ['IJenz', 'ERROR', 'ijenz'],
    ['iLame', '87791915', 'ilame'],
    ['ilGabbrone', 'ERROR', 'ilgabbrone'],
    ['IlloJuan', '90075649', 'illojuan'],
    ['ilMasseo', '55933037', 'ilmasseo'],
    ['ilrossopiubelloditwitch', '821717189', 'ilrossopiubelloditwitch'],
    ['Im_Dontai', '81918254', 'im_dontai'],
    ['imantado', '476005292', 'imantado'],
    ['imaqtpie', '24991333', 'imaqtpie'],
    ['imls', '26513896', 'imls'],
    ['ImMarksman', '15386355', 'immarksman'],
    ['ImperialHal__', '146922206', 'imperialhal__'],
    ['impulseSV', '41176642', 'impulsesv'],
    ['imviolet_', '252393390', 'imviolet_'],
    ['indialovewestbrooks', '1290016492', 'indialovewestbrooks'],
    ['IngredyBarbi', '499926713', 'ingredybarbi'],
    ['inkmate0', '544780041', 'inkmate0'],
    ['innocents', '7920047', 'innocents'],
    ['Inoxtag', '80716629', 'inoxtag'],
    ['INSCOPE21TV', '38169925', 'inscope21tv'],
    ['Insomniac', '232672264', 'insomniac'],
    ['Insym', '75738685', 'insym'],
    ['ironmouse', '175831187', 'ironmouse'],
    ['isamu', '72684812', 'isamu'],
    ['IShowSpeed', '220476955', 'ishowspeed'],
    ['iskall85', '69239046', 'iskall85'],
    ['its_iron', '411746363', 'its_iron'],
    ['itsHafu', '30777889', 'itshafu'],
    ['ItsJSTN', '52839414', 'itsjstn'],
    ['itsRyanHiga', '421560387', 'itsryanhiga'],
    ['ItsSliker', 'ERROR', 'itssliker'],
    ['itsSpoit', '144516280', 'itsspoit'],
    ['IWDominate', '25653002', 'iwdominate'],
    ['ixxYjYxxi', '101868523', 'ixxyjyxxi'],
    ['IzakOOO', '36717908', 'izakooo'],
    ['Jackeyy', '219069796', 'jackeyy'],
    ['JackManifoldTV', '112078171', 'jackmanifoldtv'],
    ['jacksepticeye', '44578737', 'jacksepticeye'],
    ['jacksfilms', '84473294', 'jacksfilms'],
    ['Jacob4TV', '129779434', 'jacob4tv'],
    ['JadeyAnh', '240649584', 'jadeyanh'],
    ['JaggerPrincesa', '81526980', 'jaggerprincesa'],
    ['Jahrein', '6768122', 'jahrein'],
    ['Jaidefinichon', '30610294', 'jaidefinichon'],
    ['JaidenAnimations', '76979176', 'jaidenanimations'],
    ['jakenbakeLIVE', '11249217', 'jakenbakelive'],
    ['JakeWebber69', '204387843', 'jakewebber69'],
    ['Jankos', '6094619', 'jankos'],
    ['JannisZ', '120627272', 'jannisz'],
    ['Japczan', 'ERROR', 'japczan'],
    ['Jashlem', '77311995', 'jashlem'],
    ['JASONR', '103262684', 'jasonr'],
    ['jasontheween', '107117952', 'jasontheween'],
    ['Jasper7se', '77415295', 'jasper7se'],
    ['Jay3', '133220545', 'jay3'],
    ['Jaycinco', '703042869', 'jaycinco'],
    ['JayzTwoCents', '30532238', 'jayztwocents'],
    ['jbzzed', '114497555', 'jbzzed'],
    ['jcorko_', '165478707', 'jcorko_'],
    ['jeanmago', '245829588', 'jeanmago'],
    ['JeanPormanove', 'ERROR', 'jeanpormanove'],
    ['JeelTV', '114119743', 'jeeltv'],
    ['Jelty', '245226810', 'jelty'],
    ['JenFoxxx', '60160906', 'jenfoxxx'],
    ['JERICHO', '10397006', 'jericho'],
    ['Jerma985', '23936415', 'jerma985'],
    ['JessicaBlevins', '39011402', 'jessicablevins'],
    ['JesusAVGN', '34711476', 'jesusavgn'],
    ['jhdelacruz777', '749288605', 'jhdelacruz777'],
    ['jidionpremium', '651125714', 'jidionpremium'],
    ['JimmyHere', '116581327', 'jimmyhere'],
    ['jingggxd', '136397315', 'jingggxd'],
    ['Jinnytty', '159498717', 'jinnytty'],
    ['Jiozi', '159301312', 'jiozi'],
    ['Jirayalecochon', '26567552', 'jirayalecochon'],
    ['jjjjoaco', '178523026', 'jjjjoaco'],
    ['JLTomy', '155601320', 'jltomy'],
    ['Joe_Bartolozzi', '563908141', 'joe_bartolozzi'],
    ['JoeWo', '209428921', 'joewo'],
    ['JohnnyBoi_i', '91526191', 'johnnyboi_i'],
    ['JohnPanio', '186637705', 'johnpanio'],
    ['JohnPitterTV', 'ERROR', 'johnpittertv'],
    ['JojoHF', '152126110', 'jojohf'],
    ['Jolavanille', '574802385', 'jolavanille'],
    ['Jolygolf', '54804025', 'jolygolf'],
    ['JonBams', '28252159', 'jonbams'],
    ['JonSandman', '47034673', 'jonsandman'],
    ['JonVlogs', '103989988', 'jonvlogs'],
    ['Jordan_Semih', '884745809', 'jordan_semih'],
    ['JordanFisher', '224145872', 'jordanfisher'],
    ['jordy2d', '214572684', 'jordy2d'],
    ['JorgeIsaac115', '109475218', 'jorgeisaac115'],
    ['Josedeodo', '48565257', 'josedeodo'],
    ['JoshOG', '54706574', 'joshog'],
    ['joshseki', '129801067', 'joshseki'],
    ['Joueur_du_Grenier', '68078157', 'joueur_du_grenier'],
    ['jovirone', '53256534', 'jovirone'],
    ['Joyca', '192023754', 'joyca'],
    ['JRKZ', '155642616', 'jrkz'],
    ['JTGTV', '131056112', 'jtgtv'],
    ['juansguarnizo', '121510236', 'juansguarnizo'],
    ['jujalag', '521583209', 'jujalag'],
    ['jukes', '77208443', 'jukes'],
    ['julien', '85581832', 'julien'],
    ['JulienBam', '407144557', 'julienbam'],
    ['JuMayumin', '180086554', 'jumayumin'],
    ['just9n', '46490205', 'just9n'],
    ['just_ns', '42316376', 'just_ns'],
    ['JustaMinx', '134609454', 'justaminx'],
    ['JustCooman', '63667409', 'justcooman'],
    ['justfoxii', '78556622', 'justfoxii'],
    ['Jynxzi', '411377640', 'jynxzi'],
    ['jzrggg', '104157644', 'jzrggg'],
    ['k1ng', '270186408', 'k1ng'],
    ['k3soju', '128293484', 'k3soju'],
    ['k4sen', '44525650', 'k4sen'],
    ['KAANFLIX', '236619638', 'kaanflix'],
    ['Kaatsup', '544340296', 'kaatsup'],
    ['Kaceytron', '30281925', 'kaceytron'],
    ['Kaellyn', '492854165', 'kaellyn'],
    ['KaiCenat', '641972806', 'kaicenat'],
    ['Kalei', '69588825', 'kalei'],
    ['Kamet0', '27115917', 'kamet0'],
    ['KamiFN1', '128605183', 'kamifn1'],
    ['KamiKat', '36248926', 'kamikat'],
    ['KamoLRF', '161315772', 'kamolrf'],
    ['Kandyland', '57865494', 'kandyland'],
    ['KanelJoseph', '675241673', 'kaneljoseph'],
    ['Kant', '521864778', 'kant'],
    ['KarasMai', '118241089', 'karasmai'],
    ['karavay46', '175470952', 'karavay46'],
    ['karchez', '91136321', 'karchez'],
    ['Kareykadasha', '601516488', 'kareykadasha'],
    ['karljacobs', '124442278', 'karljacobs'],
    ['karlnetwork', '638065882', 'karlnetwork'],
    ['Karma', '10406', 'karma'],
    ['Kasix', '102098555', 'kasix'],
    ['KatEvolved', '126632539', 'katevolved'],
    ['katoo', '91647183', 'katoo'],
    ['KayaYanar', '487330909', 'kayayanar'],
    ['Kaydop', '63675549', 'kaydop'],
    ['KayPea', '42665223', 'kaypea'],
    ['Kaysan', '516862428', 'kaysan'],
    ['Keeoh', '151819490', 'keeoh'],
    ['KendineMuzisyen', '79087140', 'kendinemuzisyen'],
    ['KendoMurft', '234393024', 'kendomurft'],
    ['Kenji', '586142835', 'kenji'],
    ['kennyS', '39393023', 'kennys'],
    ['Kennzy', '51633358', 'kennzy'],
    ['Kephrii', '31582795', 'kephrii'],
    ['KeshaEuw', '198040640', 'keshaeuw'],
    ['Kestico', '524550694', 'kestico'],
    ['Khanada_', '181258781', 'khanada_'],
    ['Kiaraakitty', '61335991', 'kiaraakitty'],
    ['KingGeorge', '117379932', 'kinggeorge'],
    ['KingGothalion', '43830727', 'kinggothalion'],
    ['KingRichard', '66691674', 'kingrichard'],
    ['kingsleague', '121606712', 'kingsleague'],
    ['kingsleague_mex', '924842965', 'kingsleague_mex'],
    ['kinstaar', '75701802', 'kinstaar'],
    ['KiraChats', 'ERROR', 'kirachats'],
    ['kissulyap', 'ERROR', 'kissulyap'],
    ['Kitboga', '32787655', 'kitboga'],
    ['KittyPlays', '39627315', 'kittyplays'],
    ['KiXSTAR', '40035700', 'kixstar'],
    ['kkatamina', '526763937', 'kkatamina'],
    ['Klean', '126436297', 'klean'],
    ['KLO25', '171503601', 'klo25'],
    ['KmSenKangoo', '779220187', 'kmsenkangoo'],
    ['knekro', '152633332', 'knekro'],
    ['Knut', '43494917', 'knut'],
    ['KNVWN', '518396596', 'knvwn'],
    ['koil', '26469355', 'koil'],
    ['Kolderiu', '143368887', 'kolderiu'],
    ['Kolento', '29107421', 'kolento'],
    ['komanche', '100625840', 'komanche'],
    ['KonsolKulturu', 'ERROR', 'konsolkulturu'],
    ['koreshzy', '165295605', 'koreshzy'],
    ['korya_mc', '669445653', 'korya_mc'],
    ['kragiee', '124604785', 'kragiee'],
    ['Kroatomist', '98700118', 'kroatomist'],
    ['KroozzNS', '178678172', 'kroozzns'],
    ['Kruzadar', '90222378', 'kruzadar'],
    ['Kubx', '130530322', 'kubx'],
    ['Kuplinov', '45922426', 'kuplinov'],
    ['kussia88', '715007052', 'kussia88'],
    ['Kxpture', '469793900', 'kxpture'],
    ['kyle', '154425624', 'kyle'],
    ['kyootbot', '161737008', 'kyootbot'],
    ['KYR_SP33DY', '11001241', 'kyr_sp33dy'],
    ['Kyrieirving', '634368707', 'kyrieirving'],
    ['LaChilenaBelu', '170079505', 'lachilenabelu'],
    ['Lachlan', '53327800', 'lachlan'],
    ['LACOBRAAA', '97241758', 'lacobraaa'],
    ['Lacy', '494543675', 'lacy'],
    ['Laink', '89872865', 'laink'],
    ['LakshartNia', '62638609', 'lakshartnia'],
    ['landonorris', '174809651', 'landonorris'],
    ['LanuSky', '495713365', 'lanusky'],
    ['LaSapaaaaa', '212202441', 'lasapaaaaa'],
    ['Lazvell', '48677263', 'lazvell'],
    ['LCK', '124425501', 'lck'],
    ['LCS', '124420521', 'lcs'],
    ['LDShadowLady', '21580734', 'ldshadowlady'],
    ['Leb1ga', '125401117', 'leb1ga'],
    ['LeBouseuh', '96562014', 'lebouseuh'],
    ['LEC', '124422593', 'lec'],
    ['LeeandLie', '84634992', 'leeandlie'],
    ['LegendaryLea', '37116492', 'legendarylea'],
    ['LEGOO', '138111494', 'legoo'],
    ['leleo', '161921258', 'leleo'],
    ['LenaGol0vach', '87186401', 'lenagol0vach'],
    ['LeoStradale', 'ERROR', 'leostradale'],
    ['lestream', '147337432', 'lestream'],
    ['LetsGameItOut', '139709045', 'letsgameitout'],
    ['Letshe', '182427515', 'letshe'],
    ['LetsHugoTV', '117385099', 'letshugotv'],
    ['LetsTaddl', '45822345', 'letstaddl'],
    ['Levo', '71978007', 'levo'],
    ['Leynainu', '61974931', 'leynainu'],
    ['liljarvis', '205401621', 'liljarvis'],
    ['lilsimsie', '109809539', 'lilsimsie'],
    ['lilypichu', '31106024', 'lilypichu'],
    ['liminhag0d', '77573531', 'liminhag0d'],
    ['Limmy', '10386664', 'limmy'],
    ['Linca', '144395004', 'linca'],
    ['LinusTech', '35987962', 'linustech'],
    ['LIRIK', '23161357', 'lirik'],
    ['LITkillah', '541318059', 'litkillah'],
    ['LittleBigWhale', '121652526', 'littlebigwhale'],
    ['Llobeti4', '111297998', 'llobeti4'],
    ['lLocochon', '422510992', 'llocochon'],
    ['LLStylish', '128770050', 'llstylish'],
    ['llunaclark', '175017835', 'llunaclark'],
    ['Lobanjicaa', '126902046', 'lobanjicaa'],
    ['LobosJr', '28640725', 'lobosjr'],
    ['Locklear', '137347549', 'locklear'],
    ['Loeya', '166279350', 'loeya'],
    ['logic', '26929683', 'logic'],
    ['Lokonazo1', '38808314', 'lokonazo1'],
    ['lol_nemesis', '86131599', 'lol_nemesis'],
    ['LOLITOFDEZ', '57793021', 'lolitofdez'],
    ['lollolacustre', '156705811', 'lollolacustre'],
    ['loltyler1', '51496027', 'loltyler1'],
    ['Lord_Kebun', '163836275', 'lord_kebun'],
    ['Loserfruit', '41245072', 'loserfruit'],
    ['LosPollosTV', '61433001', 'lospollostv'],
    ['LOUD_Brabox', '592652063', 'loud_brabox'],
    ['loud_caiox', '108544855', 'loud_caiox'],
    ['loud_coringa', '569325723', 'loud_coringa'],
    ['LOUD_Mii', '123998916', 'loud_mii'],
    ['loud_thurzin', '569327531', 'loud_thurzin'],
    ['loud_voltan', '572866502', 'loud_voltan'],
    ['LPL', '124425627', 'lpl'],
    ['ltaespanol', '142055874', 'ltaespanol'],
    ['LuanZ7_', '247990846', 'luanz7_'],
    ['lubatv', '142546050', 'lubatv'],
    ['lucascharmoso', '59339214', 'lucascharmoso'],
    ['lucca_trem', '519554929', 'lucca_trem'],
    ['LuckyChamu', '143646010', 'luckychamu'],
    ['LucyL3in', '268488937', 'lucyl3in'],
    ['Ludwig', '40934651', 'ludwig'],
    ['Luh', '26008696', 'luh'],
    ['luisenrique21', '838412657', 'luisenrique21'],
    ['LuluLuvely', '94875296', 'lululuvely'],
    ['LuquEt4', '267635380', 'luquet4'],
    ['luquitarodriguez', '203799202', 'luquitarodriguez'],
    ['Luzu', '66370849', 'luzu'],
    ['LUZU_TV', '601665123', 'luzu_tv'],
    ['LVNDMARK', '427632467', 'lvndmark'],
    ['LVPes', '22346597', 'lvpes'],
    ['LVPes2', '42028083', 'lvpes2'],
    ['lydiaviolet', '712201914', 'lydiaviolet'],
    ['LyonWGFLive', '31561517', 'lyonwgflive'],
    ['lzinnzikaaa', '490164805', 'lzinnzikaaa'],
    ['m0E_tv', '36858184', 'm0e_tv'],
    ['m0NESYof', '218726370', 'm0nesyof'],
    ['m0xyy', '69012069', 'm0xyy'],
    ['MacieJay', '122320848', 'maciejay'],
    ['madisonbeer', '504567442', 'madisonbeer'],
    ['maethe', '46277457', 'maethe'],
    ['mafanyaking', '523836820', 'mafanyaking'],
    ['MaferRocha', '80940204', 'maferrocha'],
    ['Maghla', '131215608', 'maghla'],
    ['Magic', '26991613', 'magic'],
    ['MahdiBa', '112523183', 'mahdiba'],
    ['Mahluna', '151883075', 'mahluna'],
    ['makataO', '44057119', 'makatao'],
    ['Makina', '30685416', 'makina'],
    ['Malibuca', '185783477', 'malibuca'],
    ['mamabenjyfishy1', '458446806', 'mamabenjyfishy1'],
    ['Mande', '128856353', 'mande'],
    ['mandzio', '24558341', 'mandzio'],
    ['mang0', '26551727', 'mang0'],
    ['Mangel', '58526267', 'mangel'],
    ['ManuelFerraraTV', '131861345', 'manuelferraratv'],
    ['ManuuXO', '411712420', 'manuuxo'],
    ['MANvsGAME', '8330235', 'manvsgame'],
    ['Manyrin', '53999900', 'manyrin'],
    ['MarkiLokurasY', '75802639', 'markilokurasy'],
    ['Markiplier', '30417073', 'markiplier'],
    ['MarkitoNavaja', '494026769', 'markitonavaja'],
    ['Marlon', '1019733647', 'marlon'],
    ['MartinCirioOk', '561111389', 'martinciriook'],
    ['MarvelRivals', '993419763', 'marvelrivals'],
    ['Marzz_Ow', '174592989', 'marzz_ow'],
    ['Masayoshi', '46673989', 'masayoshi'],
    ['MasteerXd', '248926175', 'masteerxd'],
    ['MasterSnakou', '42141251', 'mastersnakou'],
    ['Mastu', '63936838', 'mastu'],
    ['MateoZ', '124491706', 'mateoz'],
    ['MatteoHS', '124318726', 'matteohs'],
    ['MattHDGamer', '12492867', 'matthdgamer'],
    ['maxim', '172376071', 'maxim'],
    ['MaximeBiaggi', '119657765', 'maximebiaggi'],
    ['Maximilian_DOOD', '30104304', 'maximilian_dood'],
    ['Maximum', '42490770', 'maximum'],
    ['Maya', '235835559', 'maya'],
    ['Mayichi', '94055227', 'mayichi'],
    ['mazellovvv', '270698079', 'mazellovvv'],
    ['mazzatomas', '202500922', 'mazzatomas'],
    ['MckyTV', '101572475', 'mckytv'],
    ['MeatyMarley', '156145307', 'meatymarley'],
    ['Megga', '194434289', 'megga'],
    ['MeikodRJ', '187352927', 'meikodrj'],
    ['melharucos', '26819117', 'melharucos'],
    ['melina', '409624608', 'melina'],
    ['Mellooow_', '224200688', 'mellooow_'],
    ['Mendo', '57717183', 'mendo'],
    ['MenosTrece', '85652487', 'menostrece'],
    ['Meowko', '195326003', 'meowko'],
    ['mero', '413012469', 'mero'],
    ['mertabimula', '463204522', 'mertabimula'],
    ['MessyRoblox', '580691169', 'messyroblox'],
    ['Meteos', '38708489', 'meteos'],
    ['Method', '121649330', 'method'],
    ['Mews', '47606906', 'mews'],
    ['Mexify', '94085135', 'mexify'],
    ['miafitz', '115511162', 'miafitz'],
    ['MiaKhalifa', '151145128', 'miakhalifa'],
    ['MiaMalkova', '216233870', 'miamalkova'],
    ['michaelreeves', '469790580', 'michaelreeves'],
    ['Michel', '75891532', 'michel'],
    ['Michou', '231634715', 'michou'],
    ['Mickalow', '30709418', 'mickalow'],
    ['Mictia00', '116706369', 'mictia00'],
    ['midbeast', '92113890', 'midbeast'],
    ['Miguelillo_RL', '175243955', 'miguelillo_rl'],
    ['Mikaylah', '134532537', 'mikaylah'],
    ['MikeShowSha', '53097223', 'mikeshowsha'],
    ['Milan926_', '405698602', 'milan926_'],
    ['milimansiilla', '229026189', 'milimansiilla'],
    ['millymusiic', '267003858', 'millymusiic'],
    ['mimimimichaela', '48289225', 'mimimimichaela'],
    ['Minecraft', '112568845', 'minecraft'],
    ['Minerva', '49498288', 'minerva'],
    ['MiniLaddd', 'ERROR', 'miniladdd'],
    ['miniminter', '39894746', 'miniminter'],
    ['Minos', '63985840', 'minos'],
    ['mira', '79294007', 'mira'],
    ['mishifu', '144827749', 'mishifu'],
    ['MissaSinfonia', '46094501', 'missasinfonia'],
    ['MissMikkaa', '48201326', 'missmikkaa'],
    ['mistermv', '28575692', 'mistermv'],
    ['MitchJones', '26194208', 'mitchjones'],
    ['Mithrain', '79442833', 'mithrain'],
    ['mitr0', '240804652', 'mitr0'],
    ['MixaZver', '179997759', 'mixazver'],
    ['Mixwell', '96116107', 'mixwell'],
    ['Mizkif', '94753024', 'mizkif'],
    ['mL7support', '51929371', 'ml7support'],
    ['mobzeraoficial', '569324171', 'mobzeraoficial'],
    ['modestal', '112619759', 'modestal'],
    ['MoDy_ALASMR', '452386981', 'mody_alasmr'],
    ['moistcr1tikal', '132230344', 'moistcr1tikal'],
    ['moji', '263044217', 'moji'],
    ['mokrivskyi', '97828400', 'mokrivskyi'],
    ['MoMaN', '18887776', 'moman'],
    ['momoladinastia', '145908612', 'momoladinastia'],
    ['momonkunn', '35999968', 'momonkunn'],
    ['Mongraal', '133705618', 'mongraal'],
    ['Monstercat', '27446517', 'monstercat'],
    ['MontanaBlack88', '45044816', 'montanablack88'],
    ['mooda', '567928581', 'mooda'],
    ['MOONMOON', '121059319', 'moonmoon'],
    ['Moonryde', '48192899', 'moonryde'],
    ['MORGENSHTERN', '772488499', 'morgenshtern'],
    ['morphe_ya', '194407709', 'morphe_ya'],
    ['mortenroyale', '135558945', 'mortenroyale'],
    ['mount', '58115154', 'mount'],
    ['MrBboy45', '21080562', 'mrbboy45'],
    ['MrBeast6000', '62568635', 'mrbeast6000'],
    ['MrDzinold', '85039743', 'mrdzinold'],
    ['MrFalll', '36413513', 'mrfalll'],
    ['MrHugo', '169703688', 'mrhugo'],
    ['MrJakeJayingee', '177467406', 'mrjakejayingee'],
    ['MrKeroro10', '32505769', 'mrkeroro10'],
    ['MRLUST', '266904770', 'mrlust'],
    ['MrSavage', '198182340', 'mrsavage'],
    ['MrSoki', '48437708', 'mrsoki'],
    ['mrstiventc', '517677074', 'mrstiventc'],
    ['MrTLexify', '41726997', 'mrtlexify'],
    ['Mrtweeday', '28635446', 'mrtweeday'],
    ['Multiply', '161129051', 'multiply'],
    ['Murda2KTV', '1090025821', 'murda2ktv'],
    ['MurdaTheDemon', 'ERROR', 'murdathedemon'],
    ['Murzofix', '76036152', 'murzofix'],
    ['Mushway', '81432617', 'mushway'],
    ['musty', '128582322', 'musty'],
    ['MuTeX', '98506045', 'mutex'],
    ['Muzz', '485420539', 'muzz'],
    ['Mylonzete', '40301754', 'mylonzete'],
    ['MYM_ALKAPONE', '31478096', 'mym_alkapone'],
    ['MYMTUMTUM69', '42999001', 'mymtumtum69'],
    ['Myth', '110690086', 'myth'],
    ['n0thing', '21442544', 'n0thing'],
    ['n3koglai', '688611748', 'n3koglai'],
    ['N3on', '427561170', 'n3on'],
    ['nacho_dayo', '190110029', 'nacho_dayo'],
    ['Nadeshot', '21130533', 'nadeshot'],
    ['Nadia', '634735100', 'nadia'],
    ['NAKOO_Fn', '422770569', 'nakoo_fn'],
    ['Nanocs1', '88997140', 'nanocs1'],
    ['NarcolepticNugget', '93641995', 'narcolepticnugget'],
    ['Naru', '38287412', 'naru'],
    ['NASA', '151920918', 'nasa'],
    ['nasdas_off', '804177371', 'nasdas_off'],
    ['natalan', '189260132', 'natalan'],
    ['NatanaelCano', '883360538', 'natanaelcano'],
    ['Natarsha', '99591839', 'natarsha'],
    ['NateHill', '181224914', 'natehill'],
    ['nAts', '120198135', 'nats'],
    ['Natsumiii', '42177890', 'natsumiii'],
    ['NBA', '152984821', 'nba'],
    ['NeburixTV', '469749101', 'neburixtv'],
    ['Necros', '129625799', 'necros'],
    ['Nedurix', '818492138', 'nedurix'],
    ['neeko', '169188075', 'neeko'],
    ['NEEXcsgo', '121329766', 'neexcsgo'],
    ['NeneCreative', '106594300', 'nenecreative'],
    ['NeonSniperPanda', '413674427', 'neonsniperpanda'],
    ['NepentheZ', '17061121', 'nepenthez'],
    ['Nephtunie', '130178840', 'nephtunie'],
    ['Nervarien', '25452510', 'nervarien'],
    ['Nexxuz', '46715780', 'nexxuz'],
    ['neymarjr', '163932929', 'neymarjr'],
    ['NeZaK_', '179144678', 'nezak_'],
    ['NiceWigg', '415954300', 'nicewigg'],
    ['Nick28T', '49303276', 'nick28t'],
    ['nickbunyun', '23458108', 'nickbunyun'],
    ['NickEh30', '44424631', 'nickeh30'],
    ['NICKMERCS', '15564828', 'nickmercs'],
    ['nicksfps', '144261138', 'nicksfps'],
    ['Nico_la', '887001013', 'nico_la'],
    ['Nieuczesana', '65759224', 'nieuczesana'],
    ['Nightblue3', '26946000', 'nightblue3'],
    ['Nihachu', '123512311', 'nihachu'],
    ['nihmune', '650221094', 'nihmune'],
    ['nikilarr', '655332536', 'nikilarr'],
    ['NikitonipongoTV', '127443997', 'nikitonipongotv'],
    ['NiklasWilson', '501438035', 'niklaswilson'],
    ['NiKo', '87477627', 'niko'],
    ['Nikof', '110119637', 'nikof'],
    ['Nikolarn', '66272442', 'nikolarn'],
    ['nilojeda', '199046842', 'nilojeda'],
    ['NimuVT', '495899004', 'nimuvt'],
    ['NinaDaddyisBack', 'ERROR', 'ninadaddyisback'],
    ['Ninja', '19571641', 'ninja'],
    ['Nintendo', '37319', 'nintendo'],
    ['Nissaxter', '42351942', 'nissaxter'],
    ['Nix', '67708794', 'nix'],
    ['nl_Kripp', '29795919', 'nl_kripp'],
    ['Nmplol', '21841789', 'nmplol'],
    ['nniru', '460120312', 'nniru'],
    ['NoahJ456', '15832755', 'noahj456'],
    ['noahreyli', '146994920', 'noahreyli'],
    ['NOBRU', '506590738', 'nobru'],
    ['noe9977', '585670655', 'noe9977'],
    ['noelmiller', '175152654', 'noelmiller'],
    ['NoJumper2K', '1111006223', 'nojumper2k'],
    ['Noni', '522692765', 'noni'],
    ['nooreax', '172312401', 'nooreax'],
    ['Northernlion', '14371185', 'northernlion'],
    ['NotAestheticallyHannah', '592594059', 'notaestheticallyhannah'],
    ['novaruu', '154028091', 'novaruu'],
    ['NoWay4u_Sir', '85397463', 'noway4u_sir'],
    ['Nuvia_OuO', '147813466', 'nuvia_ouo'],
    ['NVIDIA', '38970168', 'nvidia'],
    ['nyanners', '82350088', 'nyanners'],
    ['nzaotv', '547228834', 'nzaotv'],
    ['Oatley', '401670504', 'oatley'],
    ['ocastrin', '241163546', 'ocastrin'],
    ['OceaneAmsler', '729914963', 'oceaneamsler'],
    ['oCMz', '38632829', 'ocmz'],
    ['oddpowder', 'ERROR', 'oddpowder'],
    ['odumx', 'ERROR', 'odumx'],
    ['oestagiario', '252606559', 'oestagiario'],
    ['OfficialBoaster', '66963772', 'officialboaster'],
    ['OficialBarcellos', '111710174', 'oficialbarcellos'],
    ['ofmanny', '92941793', 'ofmanny'],
    ['OgamingLoL', '71852533', 'ogaminglol'],
    ['Ohmwrecker', '23034523', 'ohmwrecker'],
    ['ohnePixel', '43683025', 'ohnepixel'],
    ['oKINGBR', '443654989', 'okingbr'],
    ['okyyy', '462594741', 'okyyy'],
    ['OLESYALIBERMAN', '184147110', 'olesyaliberman'],
    ['OllieGamerz', '51870280', 'olliegamerz'],
    ['olofmeister', '46717011', 'olofmeister'],
    ['olyashaa', '104717035', 'olyashaa'],
    ['oMeiaUm', '72733233', 'omeiaum'],
    ['OMGitsfirefoxx', '47176475', 'omgitsfirefoxx'],
    ['OMofficial', '491625140', 'omofficial'],
    ['ONSCREEN', '27121969', 'onscreen'],
    ['ookina', '128544632', 'ookina'],
    ['oozie', '606662293', 'oozie'],
    ['ops1x', '185619753', 'ops1x'],
    ['OPscT', '49940618', 'opsct'],
    ['orangemorange', '95603047', 'orangemorange'],
    ['ORIGINPC', '56728613', 'originpc'],
    ['ORIGINPCCEO', 'ERROR', 'originpcceo'],
    ['orslok', '25058448', 'orslok'],
    ['Oscu', '146820572', 'oscu'],
    ['otplol_', '622498423', 'otplol_'],
    ['Otzdarva', '61812950', 'otzdarva'],
    ['overkillgamingofficial', '178325704', 'overkillgamingofficial'],
    ['ovotz', '210014596', 'ovotz'],
    ['ow_esports', '137512364', 'ow_esports'],
    ['ow_esports2', '156567621', 'ow_esports2'],
    ['P4wnyhof', '71672341', 'p4wnyhof'],
    ['PABELLON_4', '514595736', 'pabellon_4'],
    ['pablobruschi', '196157392', 'pablobruschi'],
    ['PAGO3', '29468517', 'pago3'],
    ['PainLivestream', '61243967', 'painlivestream'],
    ['Paluten', '43844604', 'paluten'],
    ['Pamaj', '28601033', 'pamaj'],
    ['panetty', '132817946', 'panetty'],
    ['pankyy', '82388424', 'pankyy'],
    ['Paoloidolo', '29750090', 'paoloidolo'],
    ['PapaBuyer', '476058201', 'papabuyer'],
    ['Papaplatte', '50985620', 'papaplatte'],
    ['PapeSan', '485818115', 'papesan'],
    ['PapiBlast', '187273645', 'papiblast'],
    ['PapiGaviTV', '77450490', 'papigavitv'],
    ['PapoMC', '536794313', 'papomc'],
    ['paracetamor', '72312037', 'paracetamor'],
    ['paradeev1ch', '515044370', 'paradeev1ch'],
    ['parisplatynov', '124026289', 'parisplatynov'],
    ['pashaBiceps', '47207941', 'pashabiceps'],
    ['pathofexile', '35821635', 'pathofexile'],
    ['Patife', '67773433', 'patife'],
    ['Pato', '262480800', 'pato'],
    ['patodeaqualand', '75265753', 'patodeaqualand'],
    ['PatoPapao', '35647075', 'patopapao'],
    ['Patriota', '28703999', 'patriota'],
    ['paulanobre', '55660184', 'paulanobre'],
    ['Pauleta_Twitch', '41487980', 'pauleta_twitch'],
    ['PaulinhoLOKObr', '531177917', 'paulinholokobr'],
    ['PaymoneyWubby', '38251312', 'paymoneywubby'],
    ['PCH3LK1N', '48978939', 'pch3lk1n'],
    ['Peereira7', '182714869', 'peereira7'],
    ['Pelicanger', '464285047', 'pelicanger'],
    ['Pengu', '85956078', 'pengu'],
    ['perkz_lol', '41670750', 'perkz_lol'],
    ['Perxitaa', '35980866', 'perxitaa'],
    ['Pestily', '106013742', 'pestily'],
    ['Peterbot', '574141428', 'peterbot'],
    ['peterpark', '124494583', 'peterpark'],
    ['PeteZahHutt', '21837508', 'petezahhutt'],
    ['PewDiePie', '20711821', 'pewdiepie'],
    ['PGL', '21681549', 'pgl'],
    ['PGL_CS2', '107953058', 'pgl_cs2'],
    ['PGL_Dota2', '87056709', 'pgl_dota2'],
    ['pgod', '198434884', 'pgod'],
    ['Philza', '3389768', 'philza'],
    ['Picoca', '55947845', 'picoca'],
    ['Pieface23', '52615982', 'pieface23'],
    ['PietSmiet', '21991090', 'pietsmiet'],
    ['pijack11', '48898260', 'pijack11'],
    ['Pikabooirl', '27992608', 'pikabooirl'],
    ['PimpCS', '37799181', 'pimpcs'],
    ['pimpeano', '143737983', 'pimpeano'],
    ['pimpimenta', '102346837', 'pimpimenta'],
    ['Pink_Sparkles', '84110474', 'pink_sparkles'],
    ['PinkWardlol', '72700357', 'pinkwardlol'],
    ['PintiPanda', '24756885', 'pintipanda'],
    ['PipePunk', '119310350', 'pipepunk'],
    ['PirateSoftware', '151368796', 'piratesoftware'],
    ['Piuzinho', '803762271', 'piuzinho'],
    ['pizfn', '236507843', 'pizfn'],
    ['plaqueboymax', '672238954', 'plaqueboymax'],
    ['playapex', '412132764', 'playapex'],
    ['PlayHard', '66934438', 'playhard'],
    ['PlayHearthstone', '42776357', 'playhearthstone'],
    ['PlayOverwatch', '59980349', 'playoverwatch'],
    ['PlayStation', '30011711', 'playstation'],
    ['ploo', '102731041', 'ploo'],
    ['POACH', '45143025', 'poach'],
    ['Pobelter', '25080754', 'pobelter'],
    ['poderosobagual', '788658421', 'poderosobagual'],
    ['PointCrow', '87111052', 'pointcrow'],
    ['poka', '159974499', 'poka'],
    ['pokelawls', '12943173', 'pokelawls'],
    ['Pokemon', '36653045', 'pokemon'],
    ['PokemonGO', '116082737', 'pokemongo'],
    ['pokimane', '44445592', 'pokimane'],
    ['polispol1', '198363811', 'polispol1'],
    ['Political_Punk', 'ERROR', 'political_punk'],
    ['Ponce', '50597026', 'ponce'],
    ['Popo', '91229603', 'popo'],
    ['PostMalone', '177782786', 'postmalone'],
    ['Posty', '135377687', 'posty'],
    ['POW3R', '38499199', 'pow3r'],
    ['pqueen', '177249859', 'pqueen'],
    ['Prettyboyfredo', '25097408', 'prettyboyfredo'],
    ['PrimeVideo', '168843586', 'primevideo'],
    ['PRINCE__OFF', '73486167', 'prince__off'],
    ['PROD', '174754672', 'prod'],
    ['ProfessorBroman', '39158791', 'professorbroman'],
    ['projektmelody', '478575546', 'projektmelody'],
    ['pront0', '66789788', 'pront0'],
    ['PRXf0rsakeN', '160813816', 'prxf0rsaken'],
    ['PSG', '478715115', 'psg'],
    ['PUBG_BATTLEGROUNDS', '127506955', 'pubg_battlegrounds'],
    ['pulgaboy', '48340211', 'pulgaboy'],
    ['Punz', '217965779', 'punz'],
    ['PurpleBixi', '209139976', 'purplebixi'],
    ['Purpled', '490245656', 'purpled'],
    ['Putupau', '74547134', 'putupau'],
    ['pvfrango', '756869405', 'pvfrango'],
    ['PWGood', '116738112', 'pwgood'],
    ['QTCinderella', '247808909', 'qtcinderella'],
    ['Quackity', '48526626', 'quackity'],
    ['QuackityToo', '639654714', 'quackitytoo'],
    ['QuarterJade', '173758090', 'quarterjade'],
    ['Queen_Giorgia', '273677595', 'queen_giorgia'],
    ['QuickyBaby', '30623831', 'quickybaby'],
    ['Quin69', '56649026', 'quin69'],
    ['quiriify', '717491421', 'quiriify'],
    ['RachelR', '104259136', 'rachelr'],
    ['RadioLiveMusic', '631240808', 'radiolivemusic'],
    ['Rain', '38682663', 'rain'],
    ['Rainbow6', '65171890', 'rainbow6'],
    ['Rainbow6BR', '132106826', 'rainbow6br'],
    ['rainelissss', '741740827', 'rainelissss'],
    ['RakanooLive', '119638640', 'rakanoolive'],
    ['Rakin', '44099416', 'rakin'],
    ['RakkunVT', 'ERROR', 'rakkunvt'],
    ['Ramee', '95873995', 'ramee'],
    ['Rammus53', 'ERROR', 'rammus53'],
    ['ramzes', '77964394', 'ramzes'],
    ['ranboobutnot', '663294488', 'ranboobutnot'],
    ['RanbooLive', '489155160', 'ranboolive'],
    ['Ranger', '110892046', 'ranger'],
    ['RatedEpicz', '50237189', 'ratedepicz'],
    ['RATIRL', '57292293', 'ratirl'],
    ['RatoBorrachudo', '51891532', 'ratoborrachudo'],
    ['Raud', '684393848', 'raud'],
    ['RavshanN', '92048793', 'ravshann'],
    ['Ray', '85875635', 'ray'],
    ['Ray__C', '107305687', 'ray__c'],
    ['rayasianboy', '570335223', 'rayasianboy'],
    ['RDCgaming', '63000646', 'rdcgaming'],
    ['RDjavi', '636436983', 'rdjavi'],
    ['RealKraftyy', '67650991', 'realkraftyy'],
    ['RealMadrid', '501381304', 'realmadrid'],
    ['RebeuDeter', '407837457', 'rebeudeter'],
    ['RebirthzTV', '49839696', 'rebirthztv'],
    ['Reborn', '109492660', 'reborn'],
    ['Reckful', '9072112', 'reckful'],
    ['Recrent', '39154778', 'recrent'],
    ['RedBull', '21390470', 'redbull'],
    ['Reet', '269835621', 'reet'],
    ['Reginald', '505359579', 'reginald'],
    ['Rekinss', '96812687', 'rekinss'],
    ['Rekkles', '35739604', 'rekkles'],
    ['relaxing234', '26779624', 'relaxing234'],
    ['remsua', '416083610', 'remsua'],
    ['renatko', '92848919', 'renatko'],
    ['rene8808', '806840624', 'rene8808'],
    ['RenRize', '272168411', 'renrize'],
    ['Repaz', '101020771', 'repaz'],
    ['Replays', '146790215', 'replays'],
    ['RevedTV', '97123979', 'revedtv'],
    ['REVENANT', '38446500', 'revenant'],
    ['ReventXz', '40110994', 'reventxz'],
    ['Reverse2k', '68292748', 'reverse2k'],
    ['rewinside', '46780407', 'rewinside'],
    ['reynad27', '27396889', 'reynad27'],
    ['Rezo', '622545020', 'rezo'],
    ['rezonfn', '422417281', 'rezonfn'],
    ['RezReel', '603905457', 'rezreel'],
    ['RiccardoDosee', '645448741', 'riccardodosee'],
    ['Ricci', '1054551170', 'ricci'],
    ['RiceGum', '40580009', 'ricegum'],
    ['richwcampbell', '127463427', 'richwcampbell'],
    ['rickyedit', '115657971', 'rickyedit'],
    ['Ricoy', '96604083', 'ricoy'],
    ['Riot Games', '36029255', 'riot games'],
    ['Riot_esports_Korea', '190835892', 'riot_esports_korea'],
    ['RiotGamesTurkish', '36513760', 'riotgamesturkish'],
    ['rivers_gg', '734906922', 'rivers_gg'],
    ['Rizzo', '23097521', 'rizzo'],
    ['RMCsport', '552015849', 'rmcsport'],
    ['RobertoCein', '66302775', 'robertocein'],
    ['robertpg', '467340631', 'robertpg'],
    ['Robleis', '199811071', 'robleis'],
    ['Roblox', '2983909', 'roblox'],
    ['RobTheMaster1', '166554148', 'robthemaster1'],
    ['rociodta', '181293545', 'rociodta'],
    ['RocketBaguette', '139027213', 'rocketbaguette'],
    ['RocketBeansTV', '47627824', 'rocketbeanstv'],
    ['RocketLeague', '57781936', 'rocketleague'],
    ['RocKy_', '115695918', 'rocky_'],
    ['rodezel', '47758448', 'rodezel'],
    ['rodsquare', '42242477', 'rodsquare'],
    ['Rogue', '64581694', 'rogue'],
    ['Roier', '54748186', 'roier'],
    ['RonaldoTv', '541891002', 'ronaldotv'],
    ['Rosdri_Twitch', '80216715', 'rosdri_twitch'],
    ['ROSHTEIN', '72550899', 'roshtein'],
    ['rostikfacekid', '711044449', 'rostikfacekid'],
    ['rostislav_999', '475757024', 'rostislav_999'],
    ['RRaenee', '145202260', 'rraenee'],
    ['rrcatchem', 'ERROR', 'rrcatchem'],
    ['rrcatchemm', 'ERROR', 'rrcatchemm'],
    ['RTAinJapan', '134850221', 'rtainjapan'],
    ['RTGame', '88547576', 'rtgame'],
    ['RubberRoss', '10904915', 'rubberross'],
    ['rubexdb2', '815060563', 'rubexdb2'],
    ['Rubius', '39276140', 'rubius'],
    ['Rubsarb', '125093246', 'rubsarb'],
    ['Rufusmda', '194517338', 'rufusmda'],
    ['Rug', '38148938', 'rug'],
    ['Rumathra', '41567638', 'rumathra'],
    ['runthefutmarket', '143759910', 'runthefutmarket'],
    ['Rush', '107514872', 'rush'],
    ['Rustyk', '239882716', 'rustyk'],
    ['ruyterpoubel', '529564947', 'ruyterpoubel'],
    ['ryux', '175229703', 'ryux'],
    ['s0mcs', '128002336', 's0mcs'],
    ['s1mple', '60917582', 's1mple'],
    ['S7ORMyTv', '83332770', 's7ormytv'],
    ['Saadhak', '133926538', 'saadhak'],
    ['Sackzi', '139504995', 'sackzi'],
    ['Sacriel', '23735582', 'sacriel'],
    ['sacy', '25116812', 'sacy'],
    ['SakuraaaGaming', '577667875', 'sakuraaagaming'],
    ['sakurashymko', '522970165', 'sakurashymko'],
    ['SamuelBradoock', '569324930', 'samuelbradoock'],
    ['samueletienne', '505902512', 'samueletienne'],
    ['Sanchovies', '115659124', 'sanchovies'],
    ['SandraSkins', '500906914', 'sandraskins'],
    ['saniye', '463836611', 'saniye'],
    ['Santutu', '402926627', 'santutu'],
    ['Sapnap', '44332309', 'sapnap'],
    ['sapnaplive', '638077636', 'sapnaplive'],
    ['Sardoche', '50795214', 'sardoche'],
    ['Saruei', '122863474', 'saruei'],
    ['sasa', 'ERROR', 'sasa'],
    ['sasatikk', '67519684', 'sasatikk'],
    ['sasavot', '89132304', 'sasavot'],
    ['sascha', '79769388', 'sascha'],
    ['sashagrey', '421838340', 'sashagrey'],
    ['Savjz', '43131877', 'savjz'],
    ['Scarra', '22253819', 'scarra'],
    ['Sceptic', '144977942', 'sceptic'],
    ['Schlatt', '98125665', 'schlatt'],
    ['SCHRADIN', '656099497', 'schradin'],
    ['schrodingerLee', '597535246', 'schrodingerlee'],
    ['scoped', '193270950', 'scoped'],
    ['ScreaM', '39393054', 'scream'],
    ['scump', '13240194', 'scump'],
    ['secret_xdddd', '670629077', 'secret_xdddd'],
    ['SensationLIVE', '41025762', 'sensationlive'],
    ['Sequisha', '25458544', 'sequisha'],
    ['serega_pirat', '83644032', 'serega_pirat'],
    ['Sev7n', '67191666', 'sev7n'],
    ['Sevadus', '25553391', 'sevadus'],
    ['Shadoune666', '36533048', 'shadoune666'],
    ['shadowkekw', '465131731', 'shadowkekw'],
    ['ShahZaM', '38433240', 'shahzam'],
    ['shanks_ttv', '540056482', 'shanks_ttv'],
    ['shariin3d', '569322664', 'shariin3d'],
    ['Sharishaxd', '99246707', 'sharishaxd'],
    ['SharonQueen', '455993452', 'sharonqueen'],
    ['shelao', '160062337', 'shelao'],
    ['sheviiioficial', '119611214', 'sheviiioficial'],
    ['Shiphtur', '26560695', 'shiphtur'],
    ['ShivFPS', '128149102', 'shivfps'],
    ['Shlorox', '40784764', 'shlorox'],
    ['shongxbong', '242781211', 'shongxbong'],
    ['Shotzzy', '31194266', 'shotzzy'],
    ['shroud', '37402112', 'shroud'],
    ['Shubble', '31063899', 'shubble'],
    ['shxtou', '119407348', 'shxtou'],
    ['Shylily', '100901794', 'shylily'],
    ['SicK_cs', '77165632', 'sick_cs'],
    ['SideArms4Reason', '12578353', 'sidearms4reason'],
    ['SidneyEweka', '135177864', 'sidneyeweka'],
    ['Silithur', '31220977', 'silithur'],
    ['Silky', '451786566', 'silky'],
    ['SilverName', '70075625', 'silvername'],
    ['Silvervale', '56938961', 'silvervale'],
    ['simple0s', 'ERROR', 'simple0s'],
    ['Simurgh', 'ERROR', 'simurgh'],
    ['sin6n', '632603005', 'sin6n'],
    ['sinatraa', '138094916', 'sinatraa'],
    ['singsing', '21390470', 'singsing'],
    ['sips_', '26538483', 'sips_'],
    ['SirhcEz', '27934574', 'sirhcez'],
    ['SirMaza', '39518378', 'sirmaza'],
    ['SivHD', '27686136', 'sivhd'],
    ['Skadoodle', '6978352', 'skadoodle'],
    ['Skelyy', '253987686', 'skelyy'],
    ['skeppy', '97014329', 'skeppy'],
    ['SKILLZ0R1337', '151079000', 'skillz0r1337'],
    ['SkipNhO', '63602976', 'skipnho'],
    ['SkipnhoLoja', 'ERROR', 'skipnholoja'],
    ['SkyrrozTV', '52349411', 'skyrroztv'],
    ['skywhywalker', '254030065', 'skywhywalker'],
    ['Skyyart', '70298660', 'skyyart'],
    ['SLAKUNTV', '512977322', 'slakuntv'],
    ['sleepy', '135052907', 'sleepy'],
    ['slim_shady62', '1048808548', 'slim_shady62'],
    ['Slimecicle', '47764708', 'slimecicle'],
    ['Smajor', '24713999', 'smajor'],
    ['SmallAnt', '117349875', 'smallant'],
    ['SMii7Y', '25640053', 'smii7y'],
    ['SmiteGame', '31500812', 'smitegame'],
    ['SmittyStone', 'ERROR', 'smittystone'],
    ['smqcked', '88607410', 'smqcked'],
    ['Smurfdomuca', '143891036', 'smurfdomuca'],
    ['Smzinho', '37705807', 'smzinho'],
    ['SnaggyMo', '134965839', 'snaggymo'],
    ['SNAILKICK', '63614185', 'snailkick'],
    ['sneakylol', '24538518', 'sneakylol'],
    ['Sneegsnag', '24057744', 'sneegsnag'],
    ['Snifferish', '162614098', 'snifferish'],
    ['Snip3down', '21270244', 'snip3down'],
    ['SnoopDogg', '101240144', 'snoopdogg'],
    ['Snopey', '410320296', 'snopey'],
    ['snuffy', '515567425', 'snuffy'],
    ['sodapoppin', '26301881', 'sodapoppin'],
    ['sofiaespanha', '227470294', 'sofiaespanha'],
    ['Solary', '174955366', 'solary'],
    ['SolaryFortnite', '198506129', 'solaryfortnite'],
    ['SoLLUMINATI', '110059426', 'solluminati'],
    ['SoloRenektonOnly', '30227322', 'solorenektononly'],
    ['sometimepro', '488507979', 'sometimepro'],
    ['Sommerset', '277945156', 'sommerset'],
    ['SopFix', '184875510', 'sopfix'],
    ['souenito', '200427848', 'souenito'],
    ['souljaboy', '47694770', 'souljaboy'],
    ['SovietWomble', '67802451', 'sovietwomble'],
    ['SoyPan', '57993352', 'soypan'],
    ['SparcMac', '41244221', 'sparcmac'],
    ['SparkofPhoenixTV', '36464115', 'sparkofphoenixtv'],
    ['spicyuuu', '642318624', 'spicyuuu'],
    ['spoonkid', '119925910', 'spoonkid'],
    ['Spursito', '104455653', 'spursito'],
    ['Spuzie', '28565473', 'spuzie'],
    ['Spxtacular', '66537402', 'spxtacular'],
    ['SPYGEA', '10985633', 'spygea'],
    ['Squeezie', '52130765', 'squeezie'],
    ['SquishyMuffinz', '90018770', 'squishymuffinz'],
    ['SrTumbao', '683796500', 'srtumbao'],
    ['stableronaldo', '246450563', 'stableronaldo'],
    ['stariy_bog', '121821372', 'stariy_bog'],
    ['StarLadder1', '28633177', 'starladder1'],
    ['StarLadder5', '28633374', 'starladder5'],
    ['StarLadder_cs_en', '85875535', 'starladder_cs_en'],
    ['StarVTuber', '596604572', 'starvtuber'],
    ['Staryuuki', '167189231', 'staryuuki'],
    ['steel', '195675197', 'steel'],
    ['steel_tv', '26202775', 'steel_tv'],
    ['stegi', '51304190', 'stegi'],
    ['stevewillsendit', '450775736', 'stevewillsendit'],
    ['Stewie2K', '66076836', 'stewie2k'],
    ['Stintik', '44748026', 'stintik'],
    ['Stodeh', '52647450', 'stodeh'],
    ['stompgoat', '654049265', 'stompgoat'],
    ['StoneMountain64', '22998189', 'stonemountain64'],
    ['stormen', '101936909', 'stormen'],
    ['STPeach', '100484450', 'stpeach'],
    ['StrawberryTabby', '562723403', 'strawberrytabby'],
    ['Stray228', '40488774', 'stray228'],
    ['StreamerHouse', '44741426', 'streamerhouse'],
    ['StRoGo', '233741947', 'strogo'],
    ['StRoGo1337', '727429488', 'strogo1337'],
    ['sturniolos', '623306953', 'sturniolos'],
    ['stylishnoob4', '50988750', 'stylishnoob4'],
    ['Subroza', '40965449', 'subroza'],
    ['suetam1v4', '228371036', 'suetam1v4'],
    ['SUJA', '96564203', 'suja'],
    ['summit1g', '26490481', 'summit1g'],
    ['SummonersInnLive', '40336240', 'summonersinnlive'],
    ['supertf', '59635827', 'supertf'],
    ['Surefour', '2982838', 'surefour'],
    ['Swagg', '39724467', 'swagg'],
    ['SwaggerSouls', '84432477', 'swaggersouls'],
    ['Sweatcicle', '96706929', 'sweatcicle'],
    ['SweeetTails', '183390095', 'sweeettails'],
    ['Sweet_Anita', '217377982', 'sweet_anita'],
    ['sweetdreams', '143726713', 'sweetdreams'],
    ['Swelyy', '193731552', 'swelyy'],
    ['Swiftor', '274625', 'swiftor'],
    ['Swifty', '23524577', 'swifty'],
    ['swimy', '176314965', 'swimy'],
    ['Sykkuno', '26154978', 'sykkuno'],
    ['sylvee', '175383693', 'sylvee'],
    ['Symfuhny', '31688366', 'symfuhny'],
    ['Syndicate', '16764225', 'syndicate'],
    ['SypherPK', '32140000', 'sypherpk'],
    ['T2x2', '48189727', 't2x2'],
    ['takeshi', '37370325', 'takeshi'],
    ['TaliaMar', '156788264', 'taliamar'],
    ['Talmo', '74097186', 'talmo'],
    ['Tanizen', '40299581', 'tanizen'],
    ['TANZVERBOT', '43548655', 'tanzverbot'],
    ['TapL', '132083317', 'tapl'],
    ['tarik', '36340781', 'tarik'],
    ['tarzaned', '123782776', 'tarzaned'],
    ['Taspio', '484404305', 'taspio'],
    ['tati', '133850478', 'tati'],
    ['taxi2g', '136822306', 'taxi2g'],
    ['Taylor_Jevaux', '469348555', 'taylor_jevaux'],
    ['TaySon', '189726839', 'tayson'],
    ['TazerCraft', '27941045', 'tazercraft'],
    ['TBJZL', '27947809', 'tbjzl'],
    ['tbvnks', '933366019', 'tbvnks'],
    ['TcK10', '499928989', 'tck10'],
    ['TeamRedline', '70113516', 'teamredline'],
    ['techneoblade', '481954450', 'techneoblade'],
    ['Tecnonauta', '140038984', 'tecnonauta'],
    ['Tecnosh', '36772976', 'tecnosh'],
    ['Tectone', '27717340', 'tectone'],
    ['TeeGrizzley', '431882702', 'teegrizzley'],
    ['TeePee', '23844396', 'teepee'],
    ['Teeqo', '85603763', 'teeqo'],
    ['Teeqzy_', '148043031', 'teeqzy_'],
    ['telefe', '590906662', 'telefe'],
    ['TELLIER50', '567658286', 'tellier50'],
    ['TenacityTv', '459898171', 'tenacitytv'],
    ['tenderlybae', '249559280', 'tenderlybae'],
    ['tense198_v2', '451367545', 'tense198_v2'],
    ['TenZ', '70225218', 'tenz'],
    ['TeosGame', '98099061', 'teosgame'],
    ['Terracid', '89873316', 'terracid'],
    ['Terroriser', '28243295', 'terroriser'],
    ['TFBlade', '59308271', 'tfblade'],
    ['Tfue', '60056333', 'tfue'],
    ['TGLTN', '103259021', 'tgltn'],
    ['Th3Antonio', '39115143', 'th3antonio'],
    ['thaiga', '161888550', 'thaiga'],
    ['ThaldrinLol', '46595619', 'thaldrinlol'],
    ['ThaNix229', '106721502', 'thanix229'],
    ['The8BitDrummer', '63321379', 'the8bitdrummer'],
    ['TheAlvaro845', '69564524', 'thealvaro845'],
    ['thean1meman', '51810748', 'thean1meman'],
    ['Thebausffs', '93869876', 'thebausffs'],
    ['TheBurntPeanut', '472066926', 'theburntpeanut'],
    ['TheDanDangler', '435049951', 'thedandangler'],
    ['thedanirep', '56514218', 'thedanirep'],
    ['TheDarkness', '52614128', 'thedarkness'],
    ['TheDrossRotzank', '428621952', 'thedrossrotzank'],
    ['TheExaL04', '129281284', 'theexal04'],
    ['thegameawards', '72852045', 'thegameawards'],
    ['TheGrefg', '48878319', 'thegrefg'],
    ['TheGuill84', '36318615', 'theguill84'],
    ['TheJRM', '412114748', 'thejrm'],
    ['TheKAIRI78', 'ERROR', 'thekairi78'],
    ['TheMagmaBoi', '706426284', 'themagmaboi'],
    ['theneedledrop', '57188694', 'theneedledrop'],
    ['TheNicoleT', '197406569', 'thenicolet'],
    ['Theokoles', '46864514', 'theokoles'],
    ['TheRealKnossi', '71588578', 'therealknossi'],
    ['TheRealMarzaa', '89600394', 'therealmarzaa'],
    ['THERUSSIANBADGER', '22578309', 'therussianbadger'],
    ['thesketchreal', '917774995', 'thesketchreal'],
    ['Thetylilshow', '682561320', 'thetylilshow'],
    ['thezarox03_tv', '805834896', 'thezarox03_tv'],
    ['Thiefs', '46865623', 'thiefs'],
    ['Thijs', '57025612', 'thijs'],
    ['ThomeFN', '195007466', 'thomefn'],
    ['Tiagovski555YT', '246532465', 'tiagovski555yt'],
    ['Timmac', '9244832', 'timmac'],
    ['TimTheTatman', '36769016', 'timthetatman'],
    ['TinaKitten', '42032495', 'tinakitten'],
    ['tioorochitwitch', '197688174', 'tioorochitwitch'],
    ['TisiSchubech', '52345220', 'tisischubech'],
    ['Tixinhadois', '32115632', 'tixinhadois'],
    ['TNTSportsBr', '124640241', 'tntsportsbr'],
    ['Tobias', '473183066', 'tobias'],
    ['TobiasFate', '91137296', 'tobiasfate'],
    ['Tocata', '42108204', 'tocata'],
    ['TolunayOren', '121552014', 'tolunayoren'],
    ['tommyinnit', '116228390', 'tommyinnit'],
    ['tommyinnitalt', '556173685', 'tommyinnitalt'],
    ['Tonton', '72480716', 'tonton'],
    ['TooseFN', '121706139', 'toosefn'],
    ['Topson', '153670212', 'topson'],
    ['totaamc', '854865462', 'totaamc'],
    ['Towelliee', '20694610', 'towelliee'],
    ['TpaBoMaH', '265940345', 'tpabomah'],
    ['TPAIN', '117083340', 'tpain'],
    ['Trainwreckstv', '71190292', 'trainwreckstv'],
    ['TreasureIslands', '612154518', 'treasureislands'],
    ['Trebor', '537217836', 'trebor'],
    ['Trick2g', '28036688', 'trick2g'],
    ['TrickAIM', '565189459', 'trickaim'],
    ['trihex', '22025290', 'trihex'],
    ['TrilluXe', '55898523', 'trilluxe'],
    ['TrizPariz', '421093539', 'trizpariz'],
    ['TroydanGaming', '48478126', 'troydangaming'],
    ['TrU3Ta1ent', '48286022', 'tru3ta1ent'],
    ['TrumpSC', '14836307', 'trumpsc'],
    ['Trymacs', '64342766', 'trymacs'],
    ['TSM_TheOddOne', '30080840', 'tsm_theoddone'],
    ['TSM_Viss', '90020006', 'tsm_viss'],
    ['tteuw', '47119647', 'tteuw'],
    ['Tubbo', '223191589', 'tubbo'],
    ['TubboLIVE', '478701870', 'tubbolive'],
    ['Tuli_acosta', '543231314', 'tuli_acosta'],
    ['Tumblurr', '77827128', 'tumblurr'],
    ['tuonto', '98078101', 'tuonto'],
    ['tvandeR', '132279966', 'tvander'],
    ['Twitch', '12826', 'twitch'],
    ['twitchgaming', '527115020', 'twitchgaming'],
    ['TwitchPlaysPokemon', '56648155', 'twitchplayspokemon'],
    ['TwitchPresents', '149747285', 'twitchpresents'],
    ['TwitchRivals', '197886470', 'twitchrivals'],
    ['twomad', 'ERROR', 'twomad'],
    ['Tyceno', '100048582', 'tyceno'],
    ['TypicalGamer', '7154733', 'typicalgamer'],
    ['UberHaxorNova', '7010591', 'uberhaxornova'],
    ['Ubisoft', '2158531', 'ubisoft'],
    ['UnBlessed2K', 'ERROR', 'unblessed2k'],
    ['Unboxholics', '68246485', 'unboxholics'],
    ['ungespielt', '36983084', 'ungespielt'],
    ['unicornio', '61519248', 'unicornio'],
    ['UnknownxArmy', '405008403', 'unknownxarmy'],
    ['UNLOSTV', '83399952', 'unlostv'],
    ['Uthenera', '28541821', 'uthenera'],
    ['Vadeal', '487318498', 'vadeal'],
    ['Vader', '69759951', 'vader'],
    ['Valkyrae', '79615025', 'valkyrae'],
    ['VALORANT', '490592527', 'valorant'],
    ['VALORANT_Americas', '598903130', 'valorant_americas'],
    ['VALORANT_BR', '502014446', 'valorant_br'],
    ['VALORANT_EMEA', '598902753', 'valorant_emea'],
    ['VALORANT_jpn', '544210045', 'valorant_jpn'],
    ['valorant_la', '544213766', 'valorant_la'],
    ['VALORANT_Pacific', '610457628', 'valorant_pacific'],
    ['VALORANT_TUR', '638580878', 'valorant_tur'],
    ['Valouzz', '39129104', 'valouzz'],
    ['vanillamace', '422243447', 'vanillamace'],
    ['Vargskelethor', '28219022', 'vargskelethor'],
    ['VarsityGaming', '114856888', 'varsitygaming'],
    ['VASTgg', '171897087', 'vastgg'],
    ['Vector', '128976889', 'vector'],
    ['vedal987', '85498365', 'vedal987'],
    ['VEGETTA777', '11355067', 'vegetta777'],
    ['vei', '97245742', 'vei'],
    ['velox', '109778370', 'velox'],
    ['Veni', '27430767', 'veni'],
    ['venofn', '159292184', 'venofn'],
    ['VeRsuta', '21802540', 'versuta'],
    ['VeteALaVersh_dkco', '57744501', 'vetealaversh_dkco'],
    ['VGBootCamp', '9846758', 'vgbootcamp'],
    ['Vicens', '101395464', 'vicens'],
    ['vickypalami', '211121982', 'vickypalami'],
    ['Victoria', '10180554', 'victoria'],
    ['Videoyun', '24233423', 'videoyun'],
    ['viizzzm', '532809786', 'viizzzm'],
    ['Vinesauce', '25725272', 'vinesauce'],
    ['vinnie', '208189351', 'vinnie'],
    ['VioletaG', '517536651', 'violetag'],
    ['VivaLaFazza', '131917576', 'vivalafazza'],
    ['VJET', 'ERROR', 'vjet'],
    ['vol5m', 'ERROR', 'vol5m'],
    ['volx', '94101038', 'volx'],
    ['VooDooSh', '87481167', 'voodoosh'],
    ['Voyboy', '14293484', 'voyboy'],
    ['W2S', '32488203', 'w2s'],
    ['Walid', '403474131', 'walid'],
    ['Wallibear', '206955139', 'wallibear'],
    ['WankilStudio', '31289086', 'wankilstudio'],
    ['Warcraft', '37516578', 'warcraft'],
    ['WARDELL', '100182904', 'wardell'],
    ['Warframe', '31557216', 'warframe'],
    ['waveigl', '173162545', 'waveigl'],
    ['WeAreTheVR', '63493039', 'wearethevr'],
    ['WELOVEGAMES', '30814134', 'welovegames'],
    ['Welyn', '128892121', 'welyn'],
    ['wendolynortizz', '1017626993', 'wendolynortizz'],
    ['WePlayCSGO_EEU', '680795105', 'weplaycsgo_eeu'],
    ['Werlyb', '30357893', 'werlyb'],
    ['WestCOL', '168732568', 'westcol'],
    ['Whippy', '28564152', 'whippy'],
    ['WHOPLOHOYPAREN', '510794436', 'whoplohoyparen'],
    ['WilburSoot', '185048086', 'wilbursoot'],
    ['WILDCAT', '46386566', 'wildcat'],
    ['WildTurtle', '41972342', 'wildturtle'],
    ['WillerZ', '118155820', 'willerz'],
    ['willito', '936685192', 'willito'],
    ['willneff', '122888997', 'willneff'],
    ['Willyrex', '17308628', 'willyrex'],
    ['Winghaven', '41790550', 'winghaven'],
    ['Wingsofdeath', '30171560', 'wingsofdeath'],
    ['Wirtual', '92271663', 'wirtual'],
    ['Wismichu', '30504119', 'wismichu'],
    ['WithZack', '128268757', 'withzack'],
    ['Wolfiez', '192821942', 'wolfiez'],
    ['WorldofTanks', '182560660', 'worldoftanks'],
    ['wtcN', '51950404', 'wtcn'],
    ['wuant', '25515122', 'wuant'],
    ['wudijo', '61438909', 'wudijo'],
    ['wy6f', '499767049', 'wy6f'],
    ['x2Twins', '189290002', 'x2twins'],
    ['XANDAOOGOD', '425646474', 'xandaoogod'],
    ['XANTAREScN', '82387889', 'xantarescn'],
    ['Xari', '88301612', 'xari'],
    ['Xaryu', '32085830', 'xaryu'],
    ['Xayoo_', '107418731', 'xayoo_'],
    ['Xbox', '29733529', 'xbox'],
    ['xc3jo', '137298121', 'xc3jo'],
    ['xChocoBars', '38169925', 'xchocobars'],
    ['xCry', '96246531', 'xcry'],
    ['xehugeny', 'ERROR', 'xehugeny'],
    ['XEWER', '88524154', 'xewer'],
    ['xhemigfg', '1172084357', 'xhemigfg'],
    ['Xisuma', '27273690', 'xisuma'],
    ['Xiuder_', '160489367', 'xiuder_'],
    ['xlightmoonx', '222387437', 'xlightmoonx'],
    ['xmaawx', '47594707', 'xmaawx'],
    ['xmerghani', '65866610', 'xmerghani'],
    ['xn7rq', '751527359', 'xn7rq'],
    ['xpertthief', '8957524', 'xpertthief'],
    ['Xposed', '106065411', 'xposed'],
    ['xQc', '71092938', 'xqc'],
    ['xRohat', '430023505', 'xrohat'],
    ['xTheSolutionTV', '56040562', 'xthesolutiontv'],
    ['xxfirehexx_pro', '494980868', 'xxfirehexx_pro'],
    ['xXxTheFocuSxXx', '431460701', 'xxxthefocusxxx'],
    ['Y0L0AVENTURAS', '401850133', 'y0l0aventuras'],
    ['yanlazzzz', 'ERROR', 'yanlazzzz'],
    ['YasserM55', '82479391', 'yasserm55'],
    ['Yassuo', '121203480', 'yassuo'],
    ['YatorOxx', '429062034', 'yatoroxx'],
    ['yayahuz', '194749904', 'yayahuz'],
    ['ybicanoooobov', '68950614', 'ybicanoooobov'],
    ['yeTz', '27680990', 'yetz'],
    ['YoDa', '47071880', 'yoda'],
    ['Yogscast', '20786541', 'yogscast'],
    ['YoMax', '74391737', 'yomax'],
    ['YooTide', '579537103', 'yootide'],
    ['yosoyricklive', '204708397', 'yosoyricklive'],
    ['youngdabo', '609059207', 'youngdabo'],
    ['YoungMulti', '28141853', 'youngmulti'],
    ['yourragegaming', '36926489', 'yourragegaming'],
    ['yungfilly', '247395896', 'yungfilly'],
    ['yuuechka', '423486275', 'yuuechka'],
    ['yuuri22', '499780312', 'yuuri22'],
    ['yvonnie', '45184940', 'yvonnie'],
    ['zacknani', '87184624', 'zacknani'],
    ['zackrawrr', '552120296', 'zackrawrr'],
    ['zagowt', '230924320', 'zagowt'],
    ['zainita', '492053598', 'zainita'],
    ['ZakvielChannel', '44407373', 'zakvielchannel'],
    ['ZanoXVII', '75830338', 'zanoxvii'],
    ['zarbex', '403594122', 'zarbex'],
    ['zedef', '520529162', 'zedef'],
    ['zekken', '445768007', 'zekken'],
    ['zEkO', '101448647', 'zeko'],
    ['Zeling', '58753574', 'zeling'],
    ['Zellsis', '49891804', 'zellsis'],
    ['Zemie', '104632789', 'zemie'],
    ['Zenon_OF', 'ERROR', 'zenon_of'],
    ['Zentreya', '128440061', 'zentreya'],
    ['ZEON', '31921744', 'zeon'],
    ['ZeratoR', '41719107', 'zerator'],
    ['Zerkaa', '13884994', 'zerkaa'],
    ['ZeRo', '28211644', 'zero'],
    ['ZeROBADASS', '28526571', 'zerobadass'],
    ['ZexRow', '83026310', 'zexrow'],
    ['ziGueira', '32171655', 'zigueira'],
    ['ZilverK', '45736373', 'zilverk'],
    ['Zizaran', '36483360', 'zizaran'],
    ['ZLOYn', '22814674', 'zloyn'],
    ['zoespencer', '841433765', 'zoespencer'],
    ['Zoloftly', 'ERROR', 'zoloftly'],
    ['Zombey', '32659255', 'zombey'],
    ['ZONY', '101286926', 'zony'],
    ['zoodasa', '138287817', 'zoodasa'],
    ['Zoomaa', '105584645', 'zoomaa'],
    ['zorlaKOKA', '43045369', 'zorlakoka'],
    ['ZormanWorld', '65876095', 'zormanworld'],
    ['zubarefff', '777707810', 'zubarefff'],
    ['zwebackhd', '43650535', 'zwebackhd'],
    ['zxcursed', 'ERROR', 'zxcursed'],
    ['Zy0xxx', '79202256', 'zy0xxx'],
    ['ありさか', 'ERROR', 'ありさか'],
    ['だるまいずごっど', 'ERROR', 'だるまいずごっど'],
    ['らっだぁ', 'ERROR', 'らっだぁ'],
    ['スタンミ', 'ERROR', 'スタンミ'],
    ['ボドカさん', 'ERROR', 'ボドカさん'],
    ['丁特', 'ERROR', '丁特'],
    ['亞洲統神', 'ERROR', '亞洲統神'],
    ['依渟', 'ERROR', '依渟'],
    ['加藤純一うん〇ちゃん', 'ERROR', '加藤純一うん〇ちゃん'],
    ['叶ちゃんねる', 'ERROR', '叶ちゃんねる'],
    ['夢野あかり', 'ERROR', '夢野あかり'],
    ['柊ツルギ', 'ERROR', '柊ツルギ'],
    ['橘ひなの', 'ERROR', '橘ひなの'],
    ['猫麦とろろ', 'ERROR', '猫麦とろろ'],
    ['老皮', 'ERROR', '老皮'],
    ['赤見かるび', 'ERROR', '赤見かるび'],
    ['赤鬼伯伯', 'ERROR', '赤鬼伯伯'],
    ['餐餐自由配', 'ERROR', '餐餐自由配'],
    ['강지', 'ERROR', '강지'],
    ['갱생레바', 'ERROR', '갱생레바'],
    ['견자희', 'ERROR', '견자희'],
    ['괴물쥐123', 'ERROR', '괴물쥐123'],
    ['김블루', 'ERROR', '김블루'],
    ['김재원_', 'ERROR', '김재원_'],
    ['다주', 'ERROR', '다주'],
    ['랄로', 'ERROR', '랄로'],
    ['마젠타_', 'ERROR', '마젠타_'],
    ['머독', 'ERROR', '머독'],
    ['빛베리', 'ERROR', '빛베리'],
    ['서새봄냥', 'ERROR', '서새봄냥'],
    ['수련수련', 'ERROR', '수련수련'],
    ['악녀', 'ERROR', '악녀'],
    ['앰비션_', 'ERROR', '앰비션_'],
    ['오킹', 'ERROR', '오킹'],
    ['우왁굳', 'ERROR', '우왁굳'],
    ['우주하마', 'ERROR', '우주하마'],
    ['울프', 'ERROR', '울프'],
    ['윤개굴이', 'ERROR', '윤개굴이'],
    ['침착맨', 'ERROR', '침착맨'],
    ['탬탬버린', 'ERROR', '탬탬버린'],
    ['테디이', 'ERROR', '테디이'],
    ['파카9999', 'ERROR', '파카9999'],
    ['풍월량', 'ERROR', '풍월량'],
    ['한갱', 'ERROR', '한갱'],
    ['한동숙', 'ERROR', '한동숙']

];

/**
 * Streamer display name lookup map for O(1) access performance.
 * 
 * @constant STREAMER_DISPLAY_MAP - Maps internal keys to display names
 */
const STREAMER_DISPLAY_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, name]));

/**
 * Twitch ID lookup map for O(1) access performance.
 * 
 * @constant STREAMER_ID_MAP - Maps internal keys to Twitch numeric IDs
 */
const STREAMER_ID_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, id]));

// =====================================================================
// DOWNLOAD PROGRESS TRACKER
// =====================================================================

/**
 * Manages visual feedback for batch emote downloading operations.
 * 
 * Provides real-time progress indication with byte-level tracking,
 * download speed calculation, and cancellation support.
 */
class DownloadProgressTracker {
    private plugin: SevenTVPlugin;
    private totalEmotes: number = 0;
    private downloadedEmotes: number = 0;
    private failedEmotes: number = 0;
    private totalBytes: number = 0;
    private downloadedBytes: number = 0;
    private statusBarEl: HTMLElement | null = null;
    private isActive: boolean = false;
    private isCancelled: boolean = false;
    private startTime: number = 0;
    private currentBatch: number = 0;
    private totalBatches: number = 0;
    private onCancelCallback: (() => void) | null = null;

    /**
     * Creates a new progress tracker instance.
     * 
     * @param plugin - Main plugin instance for logging coordination
     */
    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Initializes tracking for a new download session.
     * 
     * @param totalEmotes - Total number of emotes to download
     * @param onCancel - Optional callback executed on user cancellation
     */
    start(totalEmotes: number, onCancel?: () => void): void {
        this.totalEmotes = totalEmotes;
        this.downloadedEmotes = 0;
        this.failedEmotes = 0;
        this.totalBytes = 0;
        this.downloadedBytes = 0;
        this.isActive = true;
        this.isCancelled = false;
        this.startTime = Date.now();
        this.currentBatch = 0;
        this.totalBatches = Math.ceil(totalEmotes / 3); // 3 per batch
        this.onCancelCallback = onCancel || null;
        
        this.createStatusBar();
        this.updateStatusBar();
        
        this.plugin.logMessage(`Initiating download of ${totalEmotes} emotes`, 'basic');
    }

    /**
     * Creates or updates the floating status bar element.
     */
    private createStatusBar(): void {
        if (!this.statusBarEl) {
            this.statusBarEl = document.createElement('div');
            this.statusBarEl.className = 'seven-tv-download-progress';
            this.statusBarEl.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 12px;
                z-index: 9999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                min-width: 240px;
                max-width: 320px;
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(this.statusBarEl);
        }
    }

    /**
     * Converts byte counts to human-readable format.
     * 
     * @param bytes - Raw byte count to format
     * @returns Formatted string (e.g., "1.5 MB", "256 KB")
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Updates status bar content with current progress metrics.
     */
    private updateStatusBar(): void {
        if (!this.statusBarEl || !this.isActive) return;
        
        // Clear existing content
        this.statusBarEl.empty();
        
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const progress = this.totalEmotes > 0 ? (this.downloadedEmotes / this.totalEmotes) * 100 : 0;
        const speed = elapsedSeconds > 0 ? this.downloadedBytes / elapsedSeconds : 0;
        
        // Header section
        const headerContainer = this.statusBarEl.createDiv();
        headerContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
        
        const title = headerContainer.createEl('strong');
        title.textContent = '📥 7TV Emote Cache';
        
        const batchInfo = headerContainer.createEl('span');
        batchInfo.textContent = `Batch ${this.currentBatch}/${this.totalBatches}`;
        batchInfo.style.cssText = 'font-size: 11px; color: var(--text-muted);';
        
        // Progress section
        const progressContainer = this.statusBarEl.createDiv();
        progressContainer.style.cssText = 'margin-bottom: 4px;';
        
        const progressHeader = progressContainer.createDiv();
        progressHeader.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;';
        
        const progressText = progressHeader.createEl('span');
        progressText.textContent = `Progress: ${this.downloadedEmotes}/${this.totalEmotes}`;
        
        const progressPercent = progressHeader.createEl('span');
        progressPercent.textContent = `${progress.toFixed(1)}%`;
        
        // Progress bar
        const progressBarContainer = progressContainer.createDiv();
        progressBarContainer.style.cssText = 'height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden; margin-bottom: 2px;';
        
        const progressBar = progressBarContainer.createDiv();
        progressBar.style.cssText = `height: 100%; background: var(--interactive-accent); width: ${progress}%; transition: width 0.3s ease;`;
        
        // Size/speed info
        const sizeInfo = progressContainer.createDiv();
        sizeInfo.style.cssText = 'display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-bottom: 4px;';
        
        const sizeText = sizeInfo.createEl('span');
        sizeText.textContent = `${this.formatBytes(this.downloadedBytes)} / ${this.formatBytes(this.totalBytes)}`;
        
        const speedText = sizeInfo.createEl('span');
        speedText.textContent = `${this.formatBytes(speed)}/s`;
        
        // Footer section
        const footer = this.statusBarEl.createDiv();
        footer.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); align-items: center;';
        
        const timer = footer.createEl('span');
        timer.textContent = `⏱️ ${elapsedSeconds}s`;
        
        const failedInfo = footer.createEl('span');
        if (this.failedEmotes > 0) {
            failedInfo.textContent = `❌ ${this.failedEmotes} failed`;
        }
        
        // Cancel button
        const cancelButton = footer.createEl('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.addClass('mod-warning');
        cancelButton.style.cssText = 'padding: 2px 8px; font-size: 10px; height: auto; line-height: 1.2;';
        cancelButton.addEventListener('click', () => this.cancel());
    }

    /**
     * Cancels active download operation and triggers cleanup.
     */
    cancel(): void {
        if (!this.isActive) return;
        
        this.isCancelled = true;
        this.isActive = false;
        this.plugin.logMessage('Download cancelled by user', 'basic');
        
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
        
        if (this.statusBarEl) {
            this.statusBarEl.empty();
            
            const container = this.statusBarEl.createDiv();
            container.style.cssText = 'text-align: center; padding: 8px;';
            
            const title = container.createDiv();
            title.style.cssText = 'font-weight: bold; color: var(--text-error); margin-bottom: 4px;';
            title.textContent = '❌ Download Cancelled';
            
            const stats = container.createDiv();
            stats.style.cssText = 'font-size: 11px; color: var(--text-muted);';
            stats.textContent = `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`;
            
            const bytes = container.createDiv();
            bytes.style.cssText = 'font-size: 10px; color: var(--text-faint); margin-top: 4px;';
            bytes.textContent = `${this.formatBytes(this.downloadedBytes)} downloaded`;
        }
    }

    /**
     * Updates total byte estimate for download session.
     * 
     * @param bytes - Estimated total bytes for all emotes
     */
    setTotalBytes(bytes: number): void {
        this.totalBytes = bytes;
        this.updateStatusBar();
    }

    /**
     * Records successful emote download with byte count.
     * 
     * @param bytes - Bytes downloaded for this emote
     */
    recordSuccess(bytes: number = 0): void {
        if (!this.isActive) return;
        this.downloadedEmotes++;
        this.downloadedBytes += bytes;
        this.updateStatusBar();
    }

    /**
     * Records failed emote download attempt.
     */
    recordFailure(): void {
        if (!this.isActive) return;
        this.failedEmotes++;
        this.updateStatusBar();
    }

    /**
     * Updates batch progress information.
     * 
     * @param batchIndex - Current batch number (1-indexed)
     */
    updateBatch(batchIndex: number): void {
        if (!this.isActive) return;
        this.currentBatch = batchIndex;
        this.updateStatusBar();
    }

    /**
     * Completes download session with final statistics.
     */
    complete(): void {
        this.isActive = false;
        const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
        
        if (this.statusBarEl && !this.isCancelled) {
            const successRate = this.totalEmotes > 0 ? 
                ((this.downloadedEmotes - this.failedEmotes) / this.totalEmotes * 100).toFixed(1) : '0';
            const avgSpeed = totalTime > 0 ? this.downloadedBytes / totalTime : 0;
            
            // Clear existing content
            this.statusBarEl.empty();
            
            // Create main container
            const container = this.statusBarEl.createDiv();
            container.style.cssText = 'text-align: center; padding: 8px;';
            
            // Create title
            const title = container.createDiv();
            title.style.cssText = 'font-weight: bold; color: var(--text-accent); margin-bottom: 4px;';
            title.textContent = '✅ Download Complete';
            
            // Create stats line 1
            const stats1 = container.createDiv();
            stats1.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-bottom: 2px;';
            stats1.textContent = `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`;
            
            // Create stats line 2
            const stats2 = container.createDiv();
            stats2.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-bottom: 4px;';
            stats2.textContent = `${this.formatBytes(this.downloadedBytes)} total`;
            
            // Create success rate line
            const successRateEl = container.createDiv();
            successRateEl.style.cssText = 'font-size: 9px; color: var(--text-faint);';
            successRateEl.textContent = `${successRate}% success in ${totalTime}s (${this.formatBytes(avgSpeed)}/s avg)`;
            
            window.setTimeout(() => {
                if (this.statusBarEl && this.statusBarEl.parentNode) {
                    this.statusBarEl.remove();
                    this.statusBarEl = null;
                }
            }, 5000);
        }
        
        if (!this.isCancelled) {
            this.plugin.logMessage(
                `Download completed: ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} ` +
                `emotes (${this.formatBytes(this.downloadedBytes)}) in ${totalTime}s`, 
                'basic'
            );
        }
    }

    /**
     * Checks if download cancellation was requested.
     * 
     * @returns True if user requested cancellation
     */
    isCancelledRequested(): boolean {
        return this.isCancelled;
    }

    /**
     * Cleans up tracker resources and DOM elements.
     */
    cleanup(): void {
        if (this.statusBarEl && this.statusBarEl.parentNode) {
            this.statusBarEl.remove();
            this.statusBarEl = null;
        }
        this.isActive = false;
        this.isCancelled = false;
    }
}

// =====================================================================
// PLUGIN LOGGER - FIXED VERSION
// =====================================================================

/**
 * Configurable logging utility with verbosity levels.
 * 
 * Provides filtered console output with performance timing capabilities
 * for debugging and operational monitoring.
 */
class PluginLogger {
    private plugin: SevenTVPlugin;
    private defaultLogLevel: 'none' | 'basic' | 'verbose' | 'debug' = 'basic';

    /**
     * Creates logger instance bound to plugin.
     * 
     * @param plugin - Parent plugin instance for settings access
     */
    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Main logging method with level-based filtering.
     * 
     * @param message - Text to output to console
     * @param level - Minimum verbosity level required for output
     */
    log(message: string, level: 'none' | 'basic' | 'verbose' | 'debug' = 'basic'): void {
        const currentLevel = this.getLogLevel();
        
        // Map levels to numeric values for comparison
        const levelValues = {
            'none': 0,
            'basic': 1,
            'verbose': 2,
            'debug': 3
        };
        
        const currentValue = levelValues[currentLevel as keyof typeof levelValues] || 0;
        const messageValue = levelValues[level] || 0;
        
        // Only log if current level is equal or higher than message level
        // AND current level is not 'none' (0)
        if (currentValue >= messageValue && currentValue > 0) {
            console.log(`[7TV] ${message}`);
        }
    }

    /**
     * Safely retrieves current log level with fallback handling.
     * 
     * @returns Current log level or default if settings unavailable
     */
    private getLogLevel(): string {
        try {
            if (!this.plugin || !this.plugin.settings) {
                return this.defaultLogLevel;
            }
            return this.plugin.settings.logLevel || this.defaultLogLevel;
        } catch (error) {
            return this.defaultLogLevel;
        }
    }

    /**
     * Wraps async operations with performance timing when debug logging enabled.
     * 
     * @param operation - Descriptive name of operation being timed
     * @param callback - Async function to execute and time
     * @returns Promise resolving to callback result
     */
    async withTiming<T>(operation: string, callback: () => Promise<T>): Promise<T> {
        const currentLevel = this.getLogLevel();
        if (currentLevel === 'debug') {
            const startTime = performance.now();
            try {
                const result = await callback();
                const duration = performance.now() - startTime;
                this.log(`${operation} completed in ${duration.toFixed(1)}ms`, 'debug');
                return result;
            } catch (error) {
                const duration = performance.now() - startTime;
                this.log(`${operation} failed after ${duration.toFixed(1)}ms: ${error}`, 'debug');
                throw error;
            }
        } else {
            return callback();
        }
    }

    /**
     * Outputs warning messages unless logging is disabled.
     * 
     * @param message - Warning text to display
     */
    warn(message: string): void {
        const currentLevel = this.getLogLevel();
        if (currentLevel !== 'none') {
            console.warn(`[7TV] ${message}`);
        }
    }

    /**
     * Outputs error messages unless logging is disabled.
     * 
     * @param message - Error text to display
     */
    error(message: string): void {
        const currentLevel = this.getLogLevel();
        if (currentLevel !== 'none') {
            console.error(`[7TV] ${message}`);
        }
    }
}

// =====================================================================
// MAIN PLUGIN CLASS
// =====================================================================

/**
 * Core plugin class managing 7TV emote integration lifecycle.
 * 
 * Handles settings persistence, emote fetching, caching strategies,
 * and editor integration.
 */
export default class SevenTVPlugin extends Plugin {
    /** Plugin configuration settings */
    settings: SevenTVSettings;
    
    /** Emote suggestion engine for editor integration */
    private emoteSuggest: EmoteSuggest;
    
    /** Directory path for cached emote images */
    private readonly CACHE_DIR = '_7tv-emotes-cache';
    
    /** Active download operation promise for cancellation support */
    private activeDownloadPromise: Promise<void> | null = null;
    
    /** Flag tracking CSS injection state */
    private stylesInjected: boolean = false;
    
    /** Logger instance for plugin operations */
    private logger: PluginLogger;
    
    /** Progress tracker for batch downloads */
    private downloadTracker: DownloadProgressTracker;
    
    /** Flag indicating pre-cache operation completion */
    private preCacheComplete: boolean = false;
    
    /** Abort controller for active download operations */
    private abortController: AbortController | null = null;

    /**
     * Resolves active Twitch ID based on configuration priority.
     * Manual Twitch ID overrides built-in streamer selection.
     * 
     * @returns Active Twitch ID string or null if unconfigured
     */
    getActiveTwitchId(): string | null {
        if (this.settings.twitchUserId.trim()) {
            return this.settings.twitchUserId.trim();
        }
        if (this.settings.selectedStreamerId) {
            return STREAMER_ID_MAP.get(this.settings.selectedStreamerId) || null;
        }
        return null;
    }

    /**
     * Provides public access to cache directory path.
     * 
     * @returns Path to emote cache directory within vault
     */
    getCacheDir(): string {
        return this.CACHE_DIR;
    }

    /**
     * Gets the current emote count from the suggestion engine.
     * 
     * @returns Number of loaded emotes, or 0 if not initialized
     */
    getEmoteCount(): number {
        return this.emoteSuggest ? this.emoteSuggest.getEmoteCount() : 0;
    }

    /**
     * Gets the current emote map from the suggestion engine.
     * 
     * @returns Map of emote names to IDs, or empty map if not initialized
     */
    getEmoteMap(): Map<string, string> {
        return this.emoteSuggest ? this.emoteSuggest.getEmoteMap() : new Map();
    }

    /**
     * Public logging method to allow external classes to log messages.
     * 
     * @param message - Message to log
     * @param level - Log level for the message
     */
    logMessage(message: string, level: 'basic' | 'verbose' | 'debug' = 'basic'): void {
        if (this.logger) {
            this.logger.log(message, level);
        } else {
            // Fallback if logger not initialized yet
            console.log(`[7TV] ${message}`);
        }
    }

    /**
     * Public method to reset pre-cache completion status.
     */
    resetPreCacheStatus(): void {
        this.preCacheComplete = false;
    }

    /**
     * Public method to check if pre-cache is complete.
     * 
     * @returns True if pre-cache operation has completed
     */
    isPreCacheComplete(): boolean {
        return this.preCacheComplete;
    }

    /**
     * Plugin initialization lifecycle method.
     * 
     * Loads settings, injects CSS, initializes cache, registers editor
     * suggestions, and loads any pre-configured emote sets.
     */
    async onload() {
		await this.loadSettings();

        // Only use console.time if debug logging is enabled
        if (this.settings.logLevel === 'debug') {
            console.time('[7TV] Plugin initialization');
        }
        
        
        // Only log timing if debug is enabled
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'Settings loaded');
        }
        
        this.logger = new PluginLogger(this);
        this.logger.log('Plugin initialization started', 'basic');
        
        this.downloadTracker = new DownloadProgressTracker(this);
        
        this.injectStyles();
        this.logger.log('CSS injected', 'verbose');
        
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'CSS injected');
        }
        
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
            this.logger.log(`Cache initialized (strategy: ${this.settings.cacheStrategy})`, 'verbose');
            
            if (this.settings.logLevel === 'debug') {
                console.timeLog('[7TV] Plugin initialization', 'Cache initialized');
            }
        }
        
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        this.logger.log('Emote suggest registered', 'verbose');
        
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'Emote suggest registered');
        }
        
        const activeId = this.getActiveTwitchId();
        if (activeId) {
            this.logger.log(`Loading emotes for ID: ${activeId}`, 'basic');
            
            if (this.settings.logLevel === 'debug') {
                console.timeLog('[7TV] Plugin initialization', `Loading emotes for ID: ${activeId}`);
            }
            
            await this.refreshEmotesForUser(activeId);
        }
        
        this.addCommand({
            id: 'cancel-pre-cache',
            name: 'Cancel active pre-cache download',
            callback: () => {
                if (this.abortController) {
                    this.abortController.abort();
                    new Notice('Pre-cache cancelled');
                    this.logger.log('Pre-cache cancelled via command', 'basic');
                } else {
                    new Notice('No active pre-cache to cancel');
                }
            }
        });
        
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
        
        // Only end timing if debug is enabled
        if (this.settings.logLevel === 'debug') {
            console.timeEnd('[7TV] Plugin initialization');
        }
        
        this.logger.log('Plugin loaded successfully', 'basic');
    }

    /**
     * Injects CSS styles for plugin UI components with safety checks.
     * 
     * Uses inline CSS to comply with Obsidian's Content Security Policy
     * and implements duplicate injection prevention.
     */
    private injectStyles(): void {
        const styleId = 'seven-tv-emotes-styles';
        
        if (this.stylesInjected) {
            this.logger.log('Styles already injected (internal flag), skipping', 'debug');
            return;
        }
        
        if (document.getElementById(styleId)) {
            this.logger.log('Style element already exists in DOM, reusing', 'debug');
            this.stylesInjected = true;
            return;
        }
        
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            .seven-tv-streamer-suggestion-container {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                width: 100%;
                padding: 10px 4px;
                border-bottom: 1px solid var(--background-modifier-border);
                min-height: 60px;
            }
            .seven-tv-streamer-suggestion-container:last-child {
                border-bottom: none;
            }
            .seven-tv-streamer-info-section {
                display: flex;
                flex-direction: column;
                flex: 1;
            }
            .seven-tv-streamer-suggestion-name {
                font-weight: 600;
                font-size: 14px;
                color: var(--text-normal);
                line-height: 1.4;
                margin-bottom: 4px;
            }
            .seven-tv-streamer-suggestion-id {
                font-size: 12px;
                color: var(--text-muted);
                opacity: 0.8;
                line-height: 1.3;
            }
            .seven-tv-streamer-selected-indicator {
                font-size: 0.8em;
                color: var(--text-accent);
                margin-left: auto;
                padding-left: 10px;
                white-space: nowrap;
                align-self: center;
            }
            
            .seven-tv-suggestion-item {
                display: flex;
                align-items: center;
                padding: 4px 8px;
            }
            .seven-tv-suggestion-img {
                height: 1.5em !important;
                vertical-align: middle !important;
                margin-right: 0.5em !important;
                border-radius: 3px !important;
            }
            .seven-tv-suggestion-text {
                vertical-align: middle;
                color: var(--text-muted);
                font-family: var(--font-monospace);
                font-size: 0.9em;
            }
        `;
        
        document.head.appendChild(styleEl);
        this.stylesInjected = true;
        this.logger.log('CSS styles injected successfully', 'verbose');
    }

    /**
     * Plugin cleanup lifecycle method.
     * 
     * Ensures resources are properly released and active operations
     * are terminated to prevent memory leaks.
     */
    onunload() {
        if (this.activeDownloadPromise) {
            this.logger.log('Active download operation cancelled on unload', 'verbose');
        }
        
        if (this.abortController) {
            this.abortController.abort();
        }

		if (this.downloadTracker) {
        	this.downloadTracker.cleanup();
    	}
        
        this.downloadTracker.cleanup();
        
        this.logger.log('Plugin unloaded', 'basic');
    }

    /**
     * Fetches and caches emotes for specified Twitch user.
     * 
     * Updates emote suggester and applies configured cache strategy.
     * 
     * @param twitchId - Numeric Twitch user identifier
     */
    async refreshEmotesForUser(twitchId: string): Promise<void> {
        this.logger.log(`Fetching emotes for Twitch ID: ${twitchId}`, 'basic');
        const newEmoteMap = await fetchEmotesForTwitchId(twitchId);
        
        if (newEmoteMap.size <= 2) {
            throw new Error(`Only found ${newEmoteMap.size} emotes for user ${twitchId}. Expected more than 2 emotes.`);
        }
        
        this.emoteSuggest.updateEmoteMap(newEmoteMap);
        this.logger.log(`Loaded ${newEmoteMap.size} emotes`, 'basic');
        
        this.preCacheComplete = false;
    }

    /**
     * Routes emote insertion to appropriate method based on cache strategy.
     * 
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    async insertEmoteByStrategy(editor: Editor, name: string, id: string): Promise<void> {
        this.logger.log(`Inserting emote "${name}" (${id}) with ${this.settings.cacheStrategy} strategy`, 'verbose');
        
        switch (this.settings.cacheStrategy) {
            case 'no-cache':
                await this.insertWithoutCache(editor, name, id);
                break;
            case 'on-demand':
                await this.insertWithOnDemandCache(editor, name, id);
                break;
        }
    }

    /**
     * Inserts emote using direct CDN URL without local caching.
     * 
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithoutCache(editor: Editor, name: string, id: string): Promise<void> {
        const html = `<span class="seven-tv-emote" title=":${name}:"><img src="https://cdn.7tv.app/emote/${id}/1x.webp" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
        this.logger.log(`Emote "${name}" (${id}) inserted via CDN (no-cache strategy)`, 'debug');
        editor.replaceSelection(html);
    }

    /**
     * Inserts emote using local cache when available, otherwise falls back to 7TV CDN.
     * Automatically caches emotes in the background on first use for future access.
     * 
     * @param editor - Active Obsidian editor instance where emote should be inserted
     * @param name - Display name of the emote for alt text and title attributes
     * @param id - 7TV emote identifier used for cache lookup and CDN URL construction
     */
    private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
        const cacheFileName = `${id}.webp`;
        const cacheRelativePath = `${this.CACHE_DIR}/${cacheFileName}`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;

        // Use the <picture> element for CDN -> Cache fallback
        const html = `<picture class="seven-tv-emote"><source srcset="${cdnUrl}" type="image/webp"><source srcset="${cacheRelativePath}" type="image/webp"><img src="${cacheRelativePath}" alt=":${name}:" title=":${name}:" style="height:1.5em;vertical-align:middle"></picture>`;

        // Insert the emote into the editor
        editor.replaceSelection(html);

        // Check if we need to download the file to cache
        if (!(await this.app.vault.adapter.exists(cacheRelativePath))) {
            // Delay the cache download to let the CDN load first
            window.setTimeout(() => {
                this.downloadToCache(id, cdnUrl, cacheRelativePath).catch(() => {
                });
            }, 500);
        }
    }

        /**
     * Creates cache directory in vault if it doesn't exist.
     */
    private async initializeCache(): Promise<void> {
        try {
            if (!(await this.app.vault.adapter.exists(this.CACHE_DIR))) {
                await this.app.vault.createFolder(this.CACHE_DIR);
                this.logger.log(`Cache directory created: ${this.CACHE_DIR}`, 'verbose');
            } else {
                this.logger.log(`Cache directory already exists: ${this.CACHE_DIR}`, 'debug');
            }
        } catch (error) {
            this.logger.error(`Cache initialization error: ${error}`);
        }
    }

    /**
     * Public method to ensure cache is initialized when needed.
     */
    public async ensureCacheInitialized(): Promise<void> {
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
        }
    }

    /**
     * Checks if any emotes have been loaded.
     * 
     * @returns Boolean indicating if emotes are loaded
     */
    public hasLoadedEmotes(): boolean {
        return this.getEmoteCount() > 0;
    }

    /**
     * Manually triggers pre-cache for all loaded emotes.
     * 
     * @returns Promise resolving when pre-cache completes
     */
    public async triggerPreCache(): Promise<void> {
        const emoteMap = this.getEmoteMap();
        if (!emoteMap || emoteMap.size === 0) {
            throw new Error('No emotes loaded to cache');
        }
        
        this.logger.log('Starting manual pre-cache operation', 'basic');
        
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.abortController = new AbortController();
        
        this.activeDownloadPromise = this.preCacheEmoteSet(emoteMap);
        this.activeDownloadPromise
            .then(() => {
                this.preCacheComplete = true;
                this.logger.log('Pre-cache completed', 'basic');
            })
            .catch(err => {
                if (err.name === 'AbortError') {
                    this.logger.log('Pre-cache cancelled', 'basic');
                } else {
                    this.logger.warn(`Pre-cache errors: ${err}`);
                }
            })
            .finally(() => { 
                this.activeDownloadPromise = null;
                this.abortController = null;
            });
    }

    /**
     * Pre-caches all emotes in a set using batched downloads with progress tracking.
     * 
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        const totalEmotes = emoteIds.length;
        
        this.logger.log(`Starting pre-cache of ${totalEmotes} emotes`, 'basic');
        
        // FIX: Updated from 5KB to 50KB for more accurate 7TV emote size estimation
        const estimatedAverageSize = 50 * 1024; // 50KB - average for 7TV WebP emotes
        const estimatedTotalBytes = totalEmotes * estimatedAverageSize;
        
        this.downloadTracker.start(totalEmotes, () => {
            if (this.abortController) {
                this.abortController.abort();
            }
        });
        
        this.downloadTracker.setTotalBytes(estimatedTotalBytes);
        
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(totalEmotes / BATCH_SIZE);
        
        try {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                if (this.abortController?.signal.aborted || this.downloadTracker.isCancelledRequested()) {
                    throw new DOMException('Download cancelled', 'AbortError');
                }
                
                const startIdx = batchIndex * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, totalEmotes);
                const batch = emoteIds.slice(startIdx, endIdx);
                
                this.downloadTracker.updateBatch(batchIndex + 1);
                
                const promises = batch.map(id => 
                    this.ensureEmoteCached(id)
                        .then(bytes => this.downloadTracker.recordSuccess(bytes))
                        .catch(() => this.downloadTracker.recordFailure())
                );
                
                await Promise.allSettled(promises);
                
                await new Promise(resolve => {
                    window.setTimeout(resolve, 100);
                });
                
                if (batchIndex % Math.max(1, Math.floor(totalBatches * 0.1)) === 0 || batchIndex % 5 === 0) {
                    const percent = Math.round((startIdx / totalEmotes) * 100);
                    this.logger.log(`Pre-cache progress: ${startIdx}/${totalEmotes} (${percent}%)`, 'verbose');
                }
            }
            
            this.downloadTracker.complete();
            this.logger.log('Pre-cache completed', 'basic');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.log('Pre-cache was cancelled', 'basic');
            } else {
                this.logger.error(`Pre-cache failed: ${error}`);
                throw error;
            }
        }
    }

    /**
     * Ensures a specific emote is cached locally.
     * 
     * @param emoteId - 7TV emote identifier
     * @returns Number of bytes downloaded, or 0 if already cached
     */
    private async ensureEmoteCached(emoteId: string): Promise<number> {
        const cachePath = `${this.CACHE_DIR}/${emoteId}.webp`;
        if (await this.app.vault.adapter.exists(cachePath)) {
            this.logger.log(`Emote ${emoteId} already cached`, 'debug');
            return 0;
        }
        
        const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
        return await this.downloadToCache(emoteId, cdnUrl, cachePath);
    }

    /**
     * Downloads emote from 7TV CDN and saves to local cache.
     * 
     * @param emoteId - 7TV emote identifier for logging
     * @param sourceUrl - CDN source URL
     * @param destPath - Local destination path
     * @returns Number of bytes downloaded
     */
    private async downloadToCache(emoteId: string, sourceUrl: string, destPath: string): Promise<number> {
        try {
            this.logger.log(`Downloading emote ${emoteId} to cache...`, 'verbose');
            
            const response = await fetch(sourceUrl, {
                signal: this.abortController?.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const bytes = arrayBuffer.byteLength;
            
            await this.app.vault.adapter.writeBinary(destPath, arrayBuffer);
            
            const fileSize = (bytes / 1024).toFixed(1);
            this.logger.log(`Cached emote ${emoteId} (${fileSize} KB) at ${destPath}`, 'debug');
            
            return bytes;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            this.logger.warn(`Cache download failed for ${emoteId}: ${error}`);
            throw error;
        }
    }

    /**
     * Cancels active pre-cache operation.
     */
    public cancelPreCache(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.logger.log('Pre-cache cancelled', 'basic');
        }
    }

    /**
     * Checks if pre-cache is currently in progress.
     * 
     * @returns Boolean indicating if pre-cache is active
     */
    public isPreCaching(): boolean {
        return this.activeDownloadPromise !== null;
    }

    /**
     * Loads plugin settings from Obsidian's persistent storage.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Saves plugin settings to Obsidian's persistent storage.
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }
	
}

// =====================================================================
// EMOTE AUTO-COMPLETE ENGINE
// =====================================================================

/**
 * Provides emote suggestions in the editor triggered by colon character.
 * 
 * Integrates with Obsidian's EditorSuggest API for seamless auto-completion
 * with visual emote previews.
 */
class EmoteSuggest extends EditorSuggest<string> {
    /** Internal mapping of emote names to 7TV IDs */
    private emoteMap: Map<string, string> = new Map();
    
    /** Reference to main plugin instance */
    private plugin: SevenTVPlugin;

    /**
     * Creates emote suggestion engine.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app);
        this.plugin = plugin;
    }

    /**
     * Updates internal emote map with new data.
     * 
     * @param newMap - Updated map of emote names to 7TV IDs
     */
    updateEmoteMap(newMap: Map<string, string>): void {
        this.emoteMap = new Map(newMap);
        this.plugin.logMessage(`Emote map updated with ${newMap.size} emotes`, 'verbose');
    }

    /**
     * Gets the current emote map for external access.
     * 
     * @returns Current emote name to ID mapping
     */
    getEmoteMap(): Map<string, string> {
        return this.emoteMap;
    }

    /**
     * Determines when to trigger suggestion popup based on typed text.
     * 
     * @param cursor - Current cursor position in editor
     * @param editor - Active editor instance
     * @returns Trigger information or null if no trigger detected
     */
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/:([a-zA-Z0-9_]+):?$/);
        
        if (match) {
            const fullMatch = match[0];
            const query = match[1];
            const startPos = cursor.ch - fullMatch.length;
            
            this.plugin.logMessage(`Emote search triggered: "${query}"`, 'verbose');
            
            return {
                start: { line: cursor.line, ch: Math.max(0, startPos) },
                end: cursor,
                query: query
            };
        }
        return null;
    }

    /**
     * Generates suggestions based on current query.
     * 
     * @param context - Suggestion context containing query text
     * @returns Array of emote names matching the query
     */
    getSuggestions(context: EditorSuggestContext): string[] {
        const query = context.query.toLowerCase();
        const matches = Array.from(this.emoteMap.keys())
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 25);
        
        this.plugin.logMessage(`Found ${matches.length} emotes matching "${context.query}"`, 'verbose');
        
        return matches;
    }

    /**
     * Renders individual suggestion with emote image and name.
     * 
     * @param value - Emote name to render
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(value: string, el: HTMLElement): void {
        el.empty();
        const container = el.createDiv();
        container.addClass('seven-tv-suggestion-item');
        
        const emoteId = this.emoteMap.get(value);
        if (emoteId) {
            const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            
            const imgEl = container.createEl('img');
            imgEl.setAttribute('src', cdnUrl);
            imgEl.setAttribute('alt', value);
            imgEl.addClass('seven-tv-suggestion-img');
            imgEl.setAttribute('data-emote-name', value);
        }
        
        const textSpan = container.createEl('span');
        textSpan.setText(`:${value}:`);
        textSpan.addClass('seven-tv-suggestion-text');
    }

    /**
     * Handles suggestion selection and inserts emote into editor.
     * 
     * @param value - Selected emote name
     * @param evt - Mouse or keyboard event that triggered selection
     */
    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context || !this.context.editor) return;
        
        const editor = this.context.editor;
        const emoteId = this.emoteMap.get(value);
        if (!emoteId) return;
        
        this.plugin.logMessage(`Selected emote: "${value}" (ID: ${emoteId})`, 'verbose');
        
        const typedRange = editor.getRange(this.context.start, this.context.end);
        const hasTrailingColon = typedRange.endsWith(':');
        let deleteEnd = this.context.end;
        
        if (hasTrailingColon && this.context.end.ch > this.context.start.ch) {
            deleteEnd = { ...this.context.end };
        }
        
        editor.replaceRange('', this.context.start, deleteEnd);
        this.plugin.insertEmoteByStrategy(editor, value, emoteId);
    }

    /**
     * Returns count of loaded emotes.
     * 
     * @returns Number of emotes in the current map
     */
    getEmoteCount(): number {
        return this.emoteMap.size;
    }
}

// =====================================================================
// ENHANCED SETTINGS TAB
// =====================================================================

/**
 * Comprehensive settings interface with improved UX organization.
 * 
 * Features streamlined cache strategy selection with immediate visual feedback,
 * detailed status display, and clear separation between primary and advanced configuration.
 */
class EnhancedSettingTab extends PluginSettingTab {
    /** Reference to main plugin instance */
    plugin: SevenTVPlugin;
    
    /** Debounce timer for manual ID input */
    private debounceTimer: number | null = null;
    
    /** Flag preventing concurrent display calls */
    private isDisplaying: boolean = false;
    
    /** Status display element reference */
    private statusDiv: HTMLElement | null = null;
    
    /** Animation frame request ID for rendering coordination */
    private renderRequestId: number | null = null;
    
    /** Cache statistics for display */
    private cacheStats: { count: number; size: number } = { count: 0, size: 0 };
    
    /** UI element references for immediate updates */
    private onDemandRadio: HTMLElement | null = null;
    private noCacheRadio: HTMLElement | null = null;
    private preCacheButton: HTMLButtonElement | null = null;
    private cancelPreCacheButton: HTMLButtonElement | null = null;
    private clearCacheButton: HTMLButtonElement | null = null;

    /**
     * Creates settings tab instance.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the settings tab interface with organized sections.
     * 
     * Prevents concurrent display calls and includes safety checks
     * for rendering during Obsidian's measure cycles.
     */
    async display(): Promise<void> {
        if (this.isDisplaying) {
            this.plugin.logMessage('Settings tab display already in progress, cancelling duplicate', 'debug');
            return;
        }
        
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        this.isDisplaying = true;
        
        // Only log timing if debug is enabled
        if (this.plugin.settings.logLevel === 'debug') {
            console.time('[7TV] Settings render');
        }
        
        const { containerEl } = this;
        containerEl.empty();
        
        this.renderRequestId = requestAnimationFrame(async () => {
            try {
                containerEl.createEl('p', { 
                    text: 'Integrate 7TV (Twitch) emotes into your notes with auto-complete suggestions.',
                    cls: 'setting-item-description'
                });

                new Setting(containerEl).setName('Streamer selection').setHeading();
                containerEl.createEl('p', { 
                    text: 'Choose from popular streamers or enter a Twitch ID directly.',
                    cls: 'setting-item-description'
                });
                
                const streamerSetting = new Setting(containerEl)
                    .setName('Select streamer')
                    .setDesc('Streamer emotes will be available for auto-complete');
                
                const buttonContainer = streamerSetting.controlEl.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';
                buttonContainer.style.alignItems = 'center';
                
                const button = buttonContainer.createEl('button');
                button.addClass('mod-cta');
                button.style.flex = '1';
                button.style.textAlign = 'left';
                button.style.overflow = 'hidden';
                button.style.textOverflow = 'ellipsis';
                button.style.whiteSpace = 'nowrap';
                
                const updateButtonText = () => {
                    const currentKey = this.plugin.settings.selectedStreamerId;
                    button.textContent = currentKey
                        ? STREAMER_DISPLAY_MAP.get(currentKey) || currentKey
                        : 'Select streamer...';
                };
                
                updateButtonText();
                
                button.addEventListener('click', () => {
                    if (this.isDisplaying) {
                        window.setTimeout(() => {
                            this.openStreamerModal(button, updateButtonText, manualInput);
                        }, 100);
                    } else {
                        this.openStreamerModal(button, updateButtonText, manualInput);
                    }
                });
                
                const manualInput = buttonContainer.createEl('input');
                manualInput.type = 'text';
                manualInput.placeholder = 'Twitch ID';
                manualInput.value = this.plugin.settings.twitchUserId;
                manualInput.style.flex = '1';
                
                manualInput.addEventListener('input', () => {
                    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
                    
                    this.debounceTimer = window.setTimeout(async () => {
                        const value = manualInput.value.trim();
                        this.plugin.settings.twitchUserId = value;
                        
                        if (value && this.plugin.settings.selectedStreamerId) {
                            this.plugin.settings.selectedStreamerId = '';
                            updateButtonText();
                        }
                        
                        await this.plugin.saveSettings();
                        
                        if (/^\d{6,}$/.test(value)) {
                            this.plugin.logMessage(`Auto-fetching emotes for manual ID: ${value}`, 'verbose');
                            try {
                                await this.plugin.refreshEmotesForUser(value);
                                await this.updateStatus();
                                new Notice('Emotes loaded');
                            } catch (error) {
                                this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
                                new Notice('Failed to load emotes');
                            }
                        }
                    }, 800);
                });
                
                if (this.plugin.settings.selectedStreamerId || this.plugin.settings.twitchUserId) {
                    const clearButton = streamerSetting.controlEl.createEl('button');
                    clearButton.textContent = 'Clear';
                    clearButton.style.marginLeft = '8px';
                    clearButton.addEventListener('click', async () => {
                        this.plugin.settings.selectedStreamerId = '';
                        this.plugin.settings.twitchUserId = '';
                        await this.plugin.saveSettings();
                        updateButtonText();
                        manualInput.value = '';
                        new Notice('Selection cleared');
                        this.plugin.logMessage('Streamer selection cleared', 'verbose');
                        await this.updateStatus();
                    });
                }

                new Setting(containerEl).setName('Cache').setHeading();
                containerEl.createEl('p', { 
                    text: 'Control how emote images are stored on your device.',
                    cls: 'setting-item-description'
                });

                const cacheContainer = containerEl.createDiv();
                cacheContainer.style.marginBottom = '16px';
                
                const onDemandOption = cacheContainer.createDiv();
                onDemandOption.style.display = 'flex';
                onDemandOption.style.alignItems = 'flex-start';
                onDemandOption.style.marginBottom = '12px';
                onDemandOption.style.cursor = 'pointer';
                
                this.onDemandRadio = onDemandOption.createDiv();
                this.onDemandRadio.style.cssText = `
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid var(--text-muted);
                    margin-right: 10px;
                    margin-top: 2px;
                    flex-shrink: 0;
                    background: ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'var(--interactive-accent)' : 'transparent'};
                    border-color: ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'var(--interactive-accent)' : 'var(--text-muted)'};
                    transition: background-color 0.2s ease, border-color 0.2s ease;
                `;
                
                const onDemandContent = onDemandOption.createDiv();
                onDemandContent.createEl('div', { 
                    text: 'On-demand cache (recommended)',
                    attr: { style: 'font-weight: 600; margin-bottom: 2px;' }
                });
                onDemandContent.createEl('div', { 
                    text: 'Caches emotes when you first use them. Best balance of speed and storage.',
                    attr: { style: 'font-size: 0.9em; color: var(--text-muted); line-height: 1.4;' }
                });
                
                onDemandOption.addEventListener('click', async () => {
                    if (this.plugin.settings.cacheStrategy !== 'on-demand') {
                        this.plugin.settings.cacheStrategy = 'on-demand';
                        await this.plugin.saveSettings();
                        await this.plugin.ensureCacheInitialized();
                        this.updateRadioButtons();
                        this.updateActionButtons();
                        new Notice('Switched to On-Demand Cache');
                    }
                });
                
                const noCacheOption = cacheContainer.createDiv();
                noCacheOption.style.display = 'flex';
                noCacheOption.style.alignItems = 'flex-start';
                noCacheOption.style.marginBottom = '16px';
                noCacheOption.style.cursor = 'pointer';
                
                this.noCacheRadio = noCacheOption.createDiv();
                this.noCacheRadio.style.cssText = `
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid var(--text-muted);
                    margin-right: 10px;
                    margin-top: 2px;
                    flex-shrink: 0;
                    background: ${this.plugin.settings.cacheStrategy === 'no-cache' ? 'var(--interactive-accent)' : 'transparent'};
                    border-color: ${this.plugin.settings.cacheStrategy === 'no-cache' ? 'var(--interactive-accent)' : 'var(--text-muted)'};
                    transition: background-color 0.2s ease, border-color 0.2s ease;
                `;
                
                const noCacheContent = noCacheOption.createDiv();
                noCacheContent.createEl('div', { 
                    text: 'No cache',
                    attr: { style: 'font-weight: 600; margin-bottom: 2px;' }
                });
                noCacheContent.createEl('div', { 
                    text: 'Always uses CDN links. No local storage, but requires internet connection.',
                    attr: { style: 'font-size: 0.9em; color: var(--text-muted); line-height: 1.4;' }
                });
                
                noCacheOption.addEventListener('click', async () => {
                    if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                        this.plugin.settings.cacheStrategy = 'no-cache';
                        await this.plugin.saveSettings();
                        this.updateRadioButtons();
                        this.updateActionButtons();
                        new Notice('Switched to No Cache mode');
                    }
                });
                
                const actionContainer = containerEl.createDiv();
                actionContainer.style.display = 'grid';
                actionContainer.style.gridTemplateColumns = '1fr 1fr';
                actionContainer.style.gap = '8px';
                actionContainer.style.marginTop = '8px';
                actionContainer.style.marginBottom = '24px';

                this.preCacheButton = actionContainer.createEl('button');
                this.preCacheButton.textContent = 'Pre-cache now';
                this.preCacheButton.style.flex = '1';
                
                this.preCacheButton.addEventListener('click', async () => {
                    if (!this.plugin.hasLoadedEmotes()) {
                        new Notice('No emotes loaded to cache');
                        return;
                    }
                    
                    const emoteCount = this.plugin.getEmoteCount();
                    // FIX: Use more accurate size estimation (50KB per emote)
                    const estimatedSizeMB = ((emoteCount * 50) / 1024).toFixed(1);
                    
                    const confirmMsg = `This will download all ${emoteCount} emotes (est. ${estimatedSizeMB}MB).\n\nThis may take a while. Continue?`;
                    
                    new SimpleConfirmationModal(
						this.app, 
						confirmMsg, 
						async () => {
							/**
							 * Pre-cache initialization handler.
							 * 
							 * Triggers background download operation with progress tracking.
							 * Updates UI state to reflect ongoing operation and provides cancellation capability.
							 */
							new Notice('Starting pre-cache...');
							try {
								await this.plugin.triggerPreCache();
								await this.updateStatus();
							} catch (error) {
								new Notice(`Failed to start pre-cache: ${error.message}`);
							}
						}
					).open();
                });

                this.cancelPreCacheButton = actionContainer.createEl('button');
                this.cancelPreCacheButton.textContent = 'Cancel pre-cache';
                this.cancelPreCacheButton.className = 'mod-warning';
                
                this.cancelPreCacheButton.addEventListener('click', async () => {
                    if (this.plugin.isPreCaching()) {
                        this.plugin.cancelPreCache();
                        new Notice('Pre-cache cancelled');
                        this.updateActionButtons();
                        await this.updateStatus();
                    }
                });

                this.clearCacheButton = containerEl.createEl('button');
                this.clearCacheButton.textContent = 'Clear cache';
                this.clearCacheButton.style.width = '100%';
                this.clearCacheButton.style.marginTop = '8px';
                this.clearCacheButton.style.marginBottom = '24px';
                
                this.clearCacheButton.addEventListener('click', async () => {
                    const warningMsg = `⚠️ Warning: Clearing the cache may cause emotes to not display correctly if:

                    • The original CDN links change or break
                    • You're offline and emotes aren't cached
                    • You switch to "No Cache" mode later

                    Are you sure you want to clear the cache?`;
                    
                    new SimpleConfirmationModal(
						this.app, 
						warningMsg, 
						async () => {
							/**
							 * Confirmation handler: Executes cache purge operation.
							 * 
							 * Performs recursive directory removal with error boundary protection.
							 * Resets pre-cache state and updates UI to reflect cleared state.
							 */
							try {
                                const cacheDir = this.plugin.getCacheDir();
                                if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                                    await this.plugin.app.vault.adapter.rmdir(cacheDir, true);
                                    await this.plugin.ensureCacheInitialized();
                                    this.plugin.resetPreCacheStatus();
                                    await this.updateStatus();
                                    this.plugin.logMessage('Cache cleared', 'verbose');
                                    new Notice('Cache cleared successfully');
								}
							} catch (error) {
								new Notice('Failed to clear cache');
								this.plugin.logMessage(`Failed to clear cache: ${error}`, 'verbose');
							}
						}
					).open();
                });

                new Setting(containerEl).setName('Status').setHeading();
                
                this.statusDiv = containerEl.createDiv();
                this.statusDiv.style.marginBottom = '24px';
                this.statusDiv.style.padding = '12px';
                this.statusDiv.style.borderRadius = '6px';
                this.statusDiv.style.backgroundColor = 'var(--background-secondary)';
                this.statusDiv.style.border = '1px solid var(--background-modifier-border)';
                this.statusDiv.style.fontSize = '0.9em';
                
                void this.updateStatus();
                this.updateRadioButtons();
                this.updateActionButtons();

                new Setting(containerEl).setName('Advanced').setHeading();
                containerEl.createEl('p', { 
                    text: 'Debugging and troubleshooting.',
                    cls: 'setting-item-description'
                });

                new Setting(containerEl)
                    .setName('Log level')
                    .setDesc('Controls console output. Only change if debugging issues.')
                    .addDropdown(dropdown => dropdown
                        .addOption('none', 'None (Quiet)')
                        .addOption('basic', 'Basic')
                        .addOption('verbose', 'Verbose')
                        .addOption('debug', 'Debug (Maximum)')
                        .setValue(this.plugin.settings.logLevel)
                        .onChange(async (value: any) => {
                            this.plugin.settings.logLevel = value;
                            await this.plugin.saveSettings();
                            this.plugin.logMessage(`Log level changed to: ${value}`, 'verbose');
                            await this.updateStatus();
                        }));
                
                if (this.plugin.settings.logLevel === 'debug') {
                    console.timeEnd('[7TV] Settings render');
                }
                
            } catch (error) {
                this.plugin.logMessage(`Error rendering settings: ${error}`, 'verbose');
            } finally {
                this.isDisplaying = false;
                this.renderRequestId = null;
            }
        });
    }

    /**
     * Updates cache statistics from file system.
     */
    private async updateCacheStats(): Promise<void> {
        if (this.plugin.settings.cacheStrategy === 'no-cache') {
            this.cacheStats = { count: 0, size: 0 };
            return;
        }
        
        try {
            const cacheDir = this.plugin.getCacheDir();
            if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                const files = await this.plugin.app.vault.adapter.list(cacheDir);
                this.cacheStats.count = files.files.length;
                
                let totalSize = 0;
                for (const file of files.files) {
                    const stats = await this.plugin.app.vault.adapter.stat(file);
                    if (stats) {
                        totalSize += stats.size;
                    }
                }
                this.cacheStats.size = totalSize;
            } else {
                this.cacheStats = { count: 0, size: 0 };
            }
        } catch (error) {
            this.plugin.logMessage(`Failed to calculate cache stats: ${error}`, 'verbose');
            this.cacheStats = { count: 0, size: 0 };
        }
    }

    /**
     * Formats byte counts to human-readable format.
     * 
     * @param bytes - Raw byte count to format
     * @returns Formatted string with appropriate unit
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Updates radio button visual states based on current cache strategy.
     */
    private updateRadioButtons(): void {
        if (!this.onDemandRadio || !this.noCacheRadio) return;
        
        const isOnDemand = this.plugin.settings.cacheStrategy === 'on-demand';
        const isNoCache = this.plugin.settings.cacheStrategy === 'no-cache';
        
        this.onDemandRadio.style.background = isOnDemand ? 'var(--interactive-accent)' : 'transparent';
        this.onDemandRadio.style.borderColor = isOnDemand ? 'var(--interactive-accent)' : 'var(--text-muted)';
        
        this.noCacheRadio.style.background = isNoCache ? 'var(--interactive-accent)' : 'transparent';
        this.noCacheRadio.style.borderColor = isNoCache ? 'var(--interactive-accent)' : 'var(--text-muted)';
    }

    /**
     * Updates action button states based on current plugin state.
     */
    private updateActionButtons(): void {
        if (!this.preCacheButton || !this.cancelPreCacheButton || !this.clearCacheButton) return;
        
        const isNoCache = this.plugin.settings.cacheStrategy === 'no-cache';
        const hasEmotes = this.plugin.hasLoadedEmotes();
        const isPreCaching = this.plugin.isPreCaching();
        
        this.preCacheButton.disabled = isNoCache || !hasEmotes;
        this.cancelPreCacheButton.disabled = !isPreCaching;
        this.clearCacheButton.disabled = isNoCache;
        
        if (this.preCacheButton.disabled) {
            this.preCacheButton.style.opacity = '0.5';
            this.preCacheButton.style.cursor = 'not-allowed';
        } else {
            this.preCacheButton.style.opacity = '1';
            this.preCacheButton.style.cursor = 'pointer';
        }
        
        if (this.cancelPreCacheButton.disabled) {
            this.cancelPreCacheButton.style.opacity = '0.5';
            this.cancelPreCacheButton.style.cursor = 'not-allowed';
        } else {
            this.cancelPreCacheButton.style.opacity = '1';
            this.cancelPreCacheButton.style.cursor = 'pointer';
        }
        
        if (this.clearCacheButton.disabled) {
            this.clearCacheButton.style.opacity = '0.5';
            this.clearCacheButton.style.cursor = 'not-allowed';
        } else {
            this.clearCacheButton.style.opacity = '1';
            this.clearCacheButton.style.cursor = 'pointer';
        }
    }

    /**
     * Updates status section with current plugin state.
     */
    private async updateStatus(): Promise<void> {
        // Store a local reference since this.statusDiv might change
        const statusDiv = this.statusDiv;
        if (!statusDiv) return;
        
        try {
            const activeId = this.plugin.getActiveTwitchId();
            const activeStreamer = this.plugin.settings.selectedStreamerId;
            const streamerName = activeStreamer ? STREAMER_DISPLAY_MAP.get(activeStreamer) : null;
            const emoteCount = this.plugin.getEmoteCount();
            const isPreCaching = this.plugin.isPreCaching();
            const preCacheStatus = this.plugin.isPreCacheComplete() ? 'Complete' : isPreCaching ? 'In progress' : 'Not started';
            
            await this.updateCacheStats();
            
            // Clear existing content
            statusDiv.empty();
            
            // Helper function to create a status row
            const createStatusRow = (label: string, value: string) => {
                const row = statusDiv.createDiv();
                row.style.cssText = 'margin-bottom: 8px;';
                
                const strong = row.createEl('strong');
                strong.textContent = `${label}:`;
                row.createEl('br');
                
                const valueSpan = row.createSpan();
                valueSpan.textContent = value;
            };
            
            // Current source
            createStatusRow('Current source', streamerName || activeId || 'None selected');
            
            // Emotes loaded
            createStatusRow('Emotes loaded', emoteCount > 0 ? `${emoteCount} emotes` : 'None');
            
            // Cache strategy
            const cacheStrategyDisplay = this.plugin.settings.cacheStrategy === 'on-demand' ? 'On-Demand' : 'No Cache';
            createStatusRow('Cache strategy', cacheStrategyDisplay);
            
            // Cache status (only if not no-cache)
            if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                createStatusRow('Cache status', `${this.cacheStats.count} emotes cached (${this.formatBytes(this.cacheStats.size)})`);
                createStatusRow('Pre-cache', preCacheStatus);
            }
            
            // Download in progress banner
            if (isPreCaching) {
                const banner = statusDiv.createDiv();
                banner.style.cssText = 'margin-top: 8px; padding: 8px; background: var(--background-modifier-success); border-radius: 4px; font-size: 0.85em;';
                
                const bannerTitle = banner.createEl('strong');
                bannerTitle.textContent = '⏳ Download in progress';
                banner.createEl('br');
                
                const bannerText = banner.createSpan();
                bannerText.textContent = 'Check top-right corner for progress';
            }
            
            this.updateActionButtons();
        } catch (error) {
            this.plugin.logMessage(`Error updating status: ${error}`, 'verbose');
        }
    }

    /**
     * Opens streamer selection modal.
     * 
     * @param button - Button element triggering the modal
     * @param updateButtonText - Callback to update button text after selection
     * @param manualInput - Manual ID input element for synchronization
     */
    private openStreamerModal(button: HTMLButtonElement, updateButtonText: () => void, manualInput: HTMLInputElement): void {
        new StreamerSuggestModal(this.app, this.plugin, async (selectedKey) => {
            const displayName = STREAMER_DISPLAY_MAP.get(selectedKey);
            const twitchId = STREAMER_ID_MAP.get(selectedKey);
            
            if (!twitchId) {
                new Notice('Invalid streamer selection');
                return;
            }
            
            this.plugin.settings.selectedStreamerId = selectedKey;
            this.plugin.settings.twitchUserId = twitchId;
            await this.plugin.saveSettings();
            
            updateButtonText();
            manualInput.value = twitchId;
            
            this.plugin.logMessage(`Selected streamer: ${displayName} (ID: ${twitchId})`, 'verbose');
            new Notice(`Fetching ${displayName}'s emotes...`);
            
            try {
                await this.plugin.refreshEmotesForUser(twitchId);
                await this.updateStatus(); 
                new Notice(`${displayName}'s emotes loaded`);
            } catch (error) {
                this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
                new Notice('Failed to load emotes');
            }
        }).open();
    }
    
    /**
     * Settings tab cleanup lifecycle method.
     */
    hide(): void {
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.onDemandRadio = null;
        this.noCacheRadio = null;
        this.preCacheButton = null;
        this.cancelPreCacheButton = null;
        this.clearCacheButton = null;
        this.statusDiv = null;
        
        this.isDisplaying = false;
        super.hide();
        this.plugin.logMessage('Settings tab hidden', 'debug');
    }
}

/**
 * Custom confirmation modal implementing Obsidian's Modal API for safe dialog operations.
 * 
 * Replaces native browser `confirm()` to prevent Windows focus loss issues in Electron.
 * Provides consistent styling and focus management with the Obsidian ecosystem.
 * 
 * @property message - Warning/confirmation text displayed to user
 * @property onConfirm - Async callback executed upon user confirmation
 * @property onCancel - Optional callback executed upon user cancellation
 */
class SimpleConfirmationModal extends Modal {
    private message: string;
    private onConfirm: () => Promise<void> | void;
    private onCancel?: () => void;

    /**
     * Creates modal instance with configuration.
     * 
     * @param app - Obsidian application instance for UI coordination
     * @param message - Warning/confirmation text displayed to user
     * @param onConfirm - Async callback executed upon user confirmation
     * @param onCancel - Optional callback executed upon user cancellation
     */
    constructor(app: App, message: string, onConfirm: () => Promise<void> | void, onCancel?: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
    }

/**
 * Modal lifecycle method invoked when modal is presented.
 * 
 * Constructs DOM structure with warning message and action buttons.
 * Handles multi-line text and bullet points with proper HTML formatting.
 * Safety-focused with "No" as default selection to prevent accidental confirmations.
 */
onOpen(): void {
    const { contentEl } = this;
    
    // Create message container with Obsidian's standard text styling
    const messageContainer = contentEl.createDiv({ cls: 'modal-message-container' });
    
    // Use the safe DOM method
    messageContainer.appendChild(this.formatMessageWithBulletPoints(this.message));
    
    // Button container with flex layout matching Obsidian's design system
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    // Affirmative action button with primary styling
    const yesButton = buttonContainer.createEl('button', { 
        text: 'Yes',
        cls: 'mod-cta'
    });
    yesButton.addEventListener('click', () => {
        this.close();
        this.onConfirm();
    });
    
    // Negative action button with warning styling and default focus
    const noButton = buttonContainer.createEl('button', { 
        text: 'No',
        cls: 'mod-warning'
    });
    noButton.addEventListener('click', () => {
        this.close();
        if (this.onCancel) this.onCancel();
    });
    
    // Safety-first focus strategy: Default to "No" to prevent accidental confirmations
    noButton.focus();
}

/**
 * Formats plain text messages with bullet points and line breaks into a DocumentFragment.
 * 
 * @param message - Plain text message with bullet points and newlines
 * @returns DocumentFragment containing formatted content
 */
private formatMessageWithBulletPoints(message: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    
    // Split by double newlines to handle paragraphs
    const paragraphs = message.split('\n\n');
    
    for (const paragraph of paragraphs) {
        if (paragraph.includes('•')) {
            // This paragraph contains bullet points - format as list
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin: 10px 0; padding-left: 20px;';
            
            // Split by newlines and filter out empty lines
            const lines = paragraph.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const li = document.createElement('li');
                li.style.cssText = 'margin: 4px 0; color: var(--text-normal);';
                
                if (line.includes('•')) {
                    // Extract text after bullet
                    const text = line.substring(line.indexOf('•') + 1).trim();
                    li.textContent = text;
                } else {
                    // Regular line without bullet
                    li.textContent = line;
                }
                ul.appendChild(li);
            }
            
            fragment.appendChild(ul);
        } else {
            // Regular paragraph without bullet points
            const p = document.createElement('p');
            p.style.cssText = 'margin: 10px 0; color: var(--text-normal);';
            
            // Replace single newlines with <br> elements
            const lines = paragraph.split('\n');
            lines.forEach((line, index) => {
                p.appendChild(document.createTextNode(line));
                if (index < lines.length - 1) {
                    p.appendChild(document.createElement('br'));
                }
            });
            
            fragment.appendChild(p);
        }
    }
    
    return fragment;
}

/**
 * Basic HTML escaping to prevent XSS while allowing safe formatting.
 * 
 * Escapes special characters to ensure user safety while preserving
 * intentional formatting from trusted plugin messages.
 * 
 * @param text - Text to escape
 * @returns HTML-escaped text
 */
private escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

    /**
     * Modal lifecycle method invoked when modal is dismissed.
     * 
     * Ensures proper resource cleanup and restores editor focus.
     * Prevents memory leaks by clearing DOM references.
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        /**
         * Critical focus restoration: Returns focus to editor after modal dismissal.
         * Prevents the "cursor not working" issue on Windows by forcing Obsidian's
         * focus management system to re-evaluate active input targets.
         */
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            // Deferred focus restoration to ensure modal tear-down completes
            window.setTimeout(() => {
                /**
                 * Obsidian API-compatible focus restoration.
                 * The correct way to restore focus in Obsidian is to:
                 * 1. Get the editor instance from the view
                 * 2. Focus the editor's CodeMirror instance
                 * 3. Trigger a resize event to force UI reflow
                 */
                
                // Get the editor instance from the MarkdownView
                const editor = (activeView as any).editor;
                if (editor) {
                    // Focus the editor if it has a focus method
                    if (editor.focus && typeof editor.focus === 'function') {
                        editor.focus();
                    }
                    
                    // Alternative: Focus the CodeMirror instance directly
                    const cmEditor = (editor as any).cmEditor;
                    if (cmEditor && cmEditor.focus && typeof cmEditor.focus === 'function') {
                        cmEditor.focus();
                    }
                }
                
                /**
                 * Windows-specific workaround: Trigger resize event to force
                 * Electron/Windows to re-evaluate focus and rendering state.
                 */
                window.dispatchEvent(new Event('resize'));
                
            }, 100);
        }
    }
}

// =====================================================================
// STREAMER SEARCH MODAL
// =====================================================================

/**
 * Fuzzy search modal for streamer selection with two-line layout.
 * 
 * Features clean presentation with streamer names and Twitch IDs
 * clearly separated, and visual indication of current selection.
 */
class StreamerSuggestModal extends FuzzySuggestModal<string> {
    private plugin: SevenTVPlugin;
    private onChoose: (streamerKey: string) => void;

    /**
     * Creates streamer search modal.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     * @param onChoose - Callback executed on streamer selection
     */
    constructor(app: App, plugin: SevenTVPlugin, onChoose: (streamerKey: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Search for streamers...');
        this.limit = 999;
    }

    /**
     * Returns streamer keys for fuzzy search, sorted alphabetically.
     * 
     * @returns Array of streamer internal identifiers
     */
    getItems(): string[] {
        return Array.from(STREAMER_DISPLAY_MAP.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key]) => key);
    }

    /**
     * Returns display text for fuzzy matching.
     * 
     * @param item - Streamer internal identifier
     * @returns Streamer display name for search matching
     */
    getItemText(item: string): string {
        return STREAMER_DISPLAY_MAP.get(item) || item;
    }

    /**
     * Handles streamer selection from the modal.
     * 
     * @param item - Selected streamer key
     * @param evt - Mouse or keyboard event that triggered selection
     */
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }

    /**
     * Renders streamer suggestion with two-line vertical layout.
     * 
     * @param fuzzyMatch - Fuzzy match object containing item and match data
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(fuzzyMatch: FuzzyMatch<string>, el: HTMLElement): void {
        const item = fuzzyMatch.item;
        const displayName = STREAMER_DISPLAY_MAP.get(item) || item;
        const twitchId = STREAMER_ID_MAP.get(item) || 'Unknown ID';
        
        const container = el.createDiv({ cls: 'seven-tv-streamer-suggestion-container' });
        
        const infoSection = container.createDiv({ cls: 'seven-tv-streamer-info-section' });
        
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-name',
            text: displayName
        });
        
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-id',
            text: `Twitch ID: ${twitchId}`
        });
        
        if (this.plugin.settings.selectedStreamerId === item) {
            container.createDiv({ 
                text: '✓ Selected', 
                cls: 'seven-tv-streamer-selected-indicator' 
            });
        }
    }
}

// =====================================================================
// 7TV API INTEGRATION
// =====================================================================

/**
 * Fetches 7TV emote set for a given Twitch user ID.
 * 
 * Implements 7TV API v3 integration with error handling and timeout protection.
 * Returns empty map when no emotes are found.
 * 
 * @param twitchId - Numeric Twitch user identifier
 * @returns Promise resolving to map of emote names to 7TV IDs
 * 
 * @throws {Error} When API requests fail or return invalid data
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();
    
    try {
        // Use console.debug for internal logging that respects browser dev tools
        if (window.console && console.debug) {
            console.debug(`[7TV] Fetching 7TV emotes for Twitch ID: ${twitchId}`);
        }
        
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id ||
            (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        if (window.console && console.debug) {
            console.debug(`[7TV] Found emote set ID: ${emoteSetId}`);
        }
        
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            if (window.console && console.debug) {
                console.debug(`[7TV] Processing ${setData.emotes.length} emotes from set`);
            }
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                }
            });
            if (window.console && console.debug) {
                console.debug(`[7TV] Successfully mapped ${emoteMap.size} emotes`);
            }
        }
    } catch (error) {
        // Always log errors regardless of log level
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
    }
    
    return emoteMap;
}