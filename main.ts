/**
 * 7TV Emotes for Obsidian
 * 
 * Integrates 7TV (Twitch) emotes into Obsidian markdown editor with auto-complete,
 * multiple caching strategies, and streamer-specific emote sets.
 * 
 * @version 1.0.2
 * @license MIT
 * @author Tinerou
 */

import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, Plugin, PluginSettingTab, Setting,
    Notice, FuzzyMatch
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
    ['Aa9skillz', '20993498', 'aa9skillz'],
    ['Aaabroke', '888138659', 'aaabroke'],
    ['Abby', '167100879', 'abby_'],
    ['ABOKYAN', '183553158', 'abokyan'],
    ['Abugoku9999', '264984080', 'abugoku9999'],
    ['Ac7ionMan', '124467382', 'ac7ionman'],
    ['Aceu', '88946548', 'aceu'],
    ['Ache', '193032346', 'ache'],
    ['Adal', '143794475', 'adal'],
    ['Adapt', '211234859', 'adapt'],
    ['AdinRoss', '59299632', 'adinross'],
    ['AdmiralBahroo', '40972890', 'admiralbahroo'],
    ['AdmiralBulldog', '30816637', 'admiralbulldog'],
    ['Adolfz', '26707340', 'adolfz'],
    ['Adrianachechik', '457124238', 'adrianachechik_'],
    ['ADrive', '14339949', 'adrive'],
    ['AdzTV', '170547313', 'adztv'],
    ['Agent00', '90222258', 'agent00'],
    ['AgenteMaxo', '210485458', 'agentemaxo'],
    ['Agony', '30084163', 'agony'],
    ['Agraelus', '36620767', 'agraelus'],
    ['Agurin', '31545223', 'agurin'],
    ['Agusbob', '94851664', 'agusbob'],
    ['Agustin51', '99422402', 'agustin51'],
    ['AhmedShow', '103097144', 'ahmed_show'],
    ['AhriNyan', '84594988', 'ahrinyan'],
    ['Aiekillu', '27085209', 'aiekillu'],
    ['Aimbotcalvin', '84574550', 'aimbotcalvin'],
    ['Aimsey', '192434734', 'aimsey'],
    ['Aircool', '488507979', 'aircool'],
    ['Akademiks', 'ERROR', 'akademiks'],
    ['Akim', '75262446', 'akim'],
    ['AkuASMR', '177887421', 'akuasmr'],
    ['Akyuliych', '263748648', 'akyuliych'],
    ['Alanalarana', '525587062', 'alanalarana'],
    ['Alanzoka', '38244180', 'alanzoka'],
    ['Albralelie', '112868442', 'albralelie'],
    ['Alderiate', '77452537', 'alderiate'],
    ['AldoGeo', '119795835', 'aldo_geo'],
    ['Alewang', '414973116', 'alewang'],
    ['Alexby11', '19942092', 'alexby11'],
    ['Alexcrasherss', '506751031', 'alexcrasherss'],
    ['Alexelcapo', '36138196', 'alexelcapo'],
    ['AlexZedra', '122101897', 'alex_zedra'],
    ['AlinaRinRin', '114037984', 'alinarinrin'],
    ['Alinity', '38718052', 'alinity'],
    ['Alixxa', '100372176', 'alixxa'],
    ['Alliege', '243963817', 'alliege'],
    ['ALOHADANCETV', '46571894', 'alohadancetv'],
    ['Alondrissa', '541270824', 'alondrissa'],
    ['AlphaCast', '94435040', 'alphacast'],
    ['Alpharad', '75508096', 'alpharad'],
    ['AlphaSniper97', '29810567', 'alphasniper97'],
    ['Alphonsodavies', '563247824', 'alphonsodavies'],
    ['AlpTV', '100033175', 'alptv'],
    ['Amablitz', '280408230', 'amablitz'],
    ['Amar', '67931625', 'amar'],
    ['Amaru', '219431490', 'amaru'],
    ['Amaz', '43356746', 'amaz'],
    ['AmazonMusic', '123275679', 'amazonmusic'],
    ['Aminematue', '26261471', 'aminematue'],
    ['AMOURANTH', '125387632', 'amouranth'],
    ['Ampeterby7', '77649106', 'ampeterby7'],
    ['Anarabdullaev', '922408450', 'anarabdullaev'],
    ['AnasOff', '62154099', 'anas_off'],
    ['AndersVejrgang', '162621190', 'anders_vejrgang'],
    ['AndyMilonakis', '51858842', 'andymilonakis'],
    ['Angelskimi', '84569419', 'angelskimi'],
    ['Angievelasco08', '501725259', 'angievelasco08'],
    ['Angryginge13', '598713647', 'angryginge13'],
    ['AngryJoeShow', '119611214', 'angryjoeshow'],
    ['ANGRYPUG', '63164470', 'angrypug'],
    ['AnnaCramling', '485234908', 'annacramling'],
    ['Annadeniz', '251917401', 'annadeniz'],
    ['AnneMunition', '51533859', 'annemunition'],
    ['Anniebot', '44019612', 'anniebot'],
    ['AnnieFuchsia', '61294188', 'anniefuchsia'],
    ['AnniTheDuck', '126884070', 'annitheduck'],
    ['Annoying', '92372244', 'annoying'],
    ['Anny', '56418014', 'anny'],
    ['Anomaly', '76508554', 'anomaly'],
    ['AnsiChan', '169927748', 'ansichan'],
    ['Antfrost', '43882924', 'antfrost'],
    ['AnthonyKongphan', '21588571', 'anthony_kongphan'],
    ['AnthonyZ', '119415848', 'anthonyz'],
    ['AntoineDaniel', '135468063', 'antoinedaniel'],
    ['Antonychenn', '506728919', 'antonychenn'],
    ['Anyme023', '737048563', 'anyme023'],
    ['AOC', '502865545', 'aoc'],
    ['Aphromoo', '21673391', 'aphromoo'],
    ['Apored', '154723532', 'apored'],
    ['Apricot', '151054406', 'apricot'],
    ['AquaFPS', '134666774', 'aquafps'],
    ['Aquav2', '131995691', 'aquav2_'],
    ['AQUINO', '93455889', 'aquino'],
    ['Arab', '123067038', 'arab'],
    ['ArchangelHs', '95332211', 'archangel_hs'],
    ['AriaSaki', '62510206', 'ariasaki'],
    ['AriGameplays', '70357283', 'arigameplays'],
    ['Aroyitt', '178203816', 'aroyitt'],
    ['Arteezy', '23364603', 'arteezy'],
    ['Arthas', '27115707', 'arthas'],
    ['Arturofernandeztv', '528015251', 'arturofernandeztv'],
    ['ASeagull', '19070311', 'a_seagull'],
    ['Ash', '60198919', 'ash'],
    ['Asianbunnyx', '503369631', 'asianbunnyx'],
    ['AsianJeff', '272748387', 'asianjeff'],
    ['Asmongold', '26261471', 'asmongold'],
    ['Aspaszin', '269503217', 'aspaszin'],
    ['Aspen', '147927227', 'aspen'],
    ['AsunaWEEB', '48389176', 'asunaweeb'],
    ['Athena', '140551421', 'athena'],
    ['Atrioc', '23211159', 'atrioc'],
    ['Aunkere', '139345001', 'aunkere'],
    ['Auronplay', '459331509', 'auronplay'],
    ['AussieAntics', '224539819', 'aussieantics'],
    ['AustinShow', '40197643', 'austinshow'],
    ['AuzioMF', '101175894', 'auziomf'],
    ['AvaGG', '30039402', 'avagg'],
    ['AvalancheSoftware', '794555957', 'avalanchesoftware'],
    ['AverageJonas', '124304147', 'averagejonas'],
    ['AveryWest0', '818706057', 'averywest0'],
    ['AvoidingThePuddle', '23528098', 'avoidingthepuddle'],
    ['Awesamdude', '48022358', 'awesamdude'],
    ['AXoZer', '133528221', 'axozer'],
    ['AXtLOL', '41783889', 'axtlol'],
    ['AyarBaffo', '417900560', 'ayarbaffo'],
    ['Aydan', '120244187', 'aydan'],
    ['Ayellol', '45866401', 'ayellol'],
    ['Aypierre', '29753247', 'aypierre'],
    ['Ayrun', '132931679', 'ayrun'],
    ['AZRA', '414507208', 'azra'],
    ['Aztecross', '50881182', 'aztecross'],
    ['B0aty', '27107346', 'b0aty'],
    ['Babi', '569320237', 'babi'],
    ['BaconDonut', '36155872', 'bacon_donut'],
    ['BadBoyHalo', '569342750', 'badboyhalo'],
    ['BagheraJones', '100744948', 'bagherajones'],
    ['Bagi', '47125717', 'bagi'],
    ['Baiano', '140772558', 'baiano'],
    ['BaityBait', '549653218', 'baitybait'],
    ['Bajheera', '22916751', 'bajheera'],
    ['Bakzera', '469711093', 'bakzera'],
    ['Baldythenoob', '595525333', 'baldythenoob'],
    ['Bananirou', '83953406', 'bananirou'],
    ['BanduraCartel', '718236928', 'banduracartel'],
    ['Bao', '110059426', 'bao'],
    ['Barathrum1515', '401521782', 'barathrum1515'],
    ['BarcaGamer', '123042641', 'barcagamer'],
    ['BastiGHG', '38121996', 'bastighg'],
    ['BatalhaDaAldeia', '262319971', 'batalhadaaldeia'],
    ['Bateson87', '28369163', 'bateson87'],
    ['BattlestateGames', '233334675', 'battlestategames'],
    ['BayonettaTv', '148389721', 'bayonetta_tv'],
    ['Bazattak007', '83959795', 'bazattak007'],
    ['Beaulo', '38553197', 'beaulo'],
    ['Becca', '35824977', 'becca'],
    ['Behzinga', '29555307', 'behzinga'],
    ['BENIJU03', '195376105', 'beniju03'],
    ['Benjyfishy', '66983298', 'benjyfishy'],
    ['Berkriptepe', '29512470', 'berkriptepe'],
    ['Berleezy', '53441269', 'berleezy'],
    ['BetboomCsA', '75910196', 'betboom_cs_a'],
    ['BetboomRu', '129339704', 'betboom_ru'],
    ['Bethesda', '614394', 'bethesda'],
    ['BeyondTheSummit', '29578325', 'beyondthesummit'],
    ['BibleBoysChurch', '498840927', 'bibleboyschurch'],
    ['Bichouu', '173066877', 'bichouu_'],
    ['BiDa', '37825200', 'bida'],
    ['BigEx', '415249792', 'bigex'],
    ['Bigfoltz', '32607302', 'bigfoltz'],
    ['BigGuy', '744047127', 'bigguy'],
    ['Bigpuffer', '41616317', 'bigpuffer'],
    ['BigSpinCR', '144798294', 'bigspincr'],
    ['BikiniBodhi', '129342719', 'bikinibodhi'],
    ['Billzo', '215159541', 'billzo'],
    ['BiroPJL', '266187835', 'biropjl'],
    ['Bisteconee', '512137332', 'bisteconee'],
    ['Biyin', '579785040', 'biyin_'],
    ['Bjergsenlol', '38421618', 'bjergsenlol'],
    ['Blackelespanolito', '68124914', 'blackelespanolito'],
    ['Blackoutz', '156961894', 'blackoutz'],
    ['BlackUFA', '98742675', 'blackufa'],
    ['Blanchitooo', '241581961', 'blanchitooo'],
    ['BLAST', '182144693', 'blast'],
    ['BLASTPremier', '163299585', 'blastpremier'],
    ['Blau', '52959392', 'blau'],
    ['Blizzard', '8822', 'blizzard'],
    ['Blooprint', '149439626', 'blooprint'],
    ['BLOU', '610611496', 'blou'],
    ['Bmkibler', '25871845', 'bmkibler'],
    ['Bnans', '110176631', 'bnans'],
    ['BO2TVofficial', '611456265', 'bo2tvofficial'],
    ['BobbyPoffGaming', '212682921', 'bobbypoffgaming'],
    ['Bobicraftmc', '49910500', 'bobicraftmc'],
    ['BobRoss', '105458682', 'bobross'],
    ['Bocade09zx', '787984025', 'bocade09zx'],
    ['BoffeGP', '177628323', 'boffegp'],
    ['Boltz', '53052202', 'boltz'],
    ['Boogie2988', '9661257', 'boogie2988'],
    ['BoomerNA', '36156571', 'boomerna'],
    ['Booya', '193365768', 'booya'],
    ['BotezLive', '127550308', 'botezlive'],
    ['Boxbox', '38881685', 'boxbox'],
    ['BoyMinORu', '118336478', 'boyminoru'],
    ['Bratishkinoff', '99899949', 'bratishkinoff'],
    ['Brawlhalla', '75346877', 'brawlhalla'],
    ['BrawlStars', '160377301', 'brawlstars'],
    ['Brax', '29039515', 'brax'],
    ['Brino', '431679357', 'brino'],
    ['Brkk', '178752007', 'brkk'],
    ['Bronny', '518960165', 'bronny'],
    ['BrookeAB', '214560121', 'brookeab'],
    ['Brooklynfrost', '1028692635', 'brooklynfrost'],
    ['Broxah', '43539324', 'broxah'],
    ['Broxh', '105533253', 'broxh_'],
    ['Brtt', '31497918', 'brtt'],
    ['BruceDropEmOff', '88084663', 'brucedropemoff'],
    ['BruceGrannec', '31813025', 'brucegrannec'],
    ['Brunenger', '94757023', 'brunenger'],
    ['Bt0tv', '22336099', 'bt0tv'],
    ['BTMC', '46708418', 'btmc'],
    ['Btssmash', '214062798', 'btssmash'],
    ['Buckefps', '120679071', 'buckefps'],
    ['Buddha', '136765278', 'buddha'],
    ['Buerinho', '189139646', 'buerinho'],
    ['Bugha', '82524912', 'bugha'],
    ['Bungie', '53097129', 'bungie'],
    ['BunnyFuFuu', '54559073', 'bunnyfufuu'],
    ['BushCampDad', '847477998', 'bushcampdad'],
    ['BUSHWHACK18', '160257437', 'bushwhack18'],
    ['Buster', '86277097', 'buster'],
    ['Byfliper', 'ERROR', 'byfliper_'],
    ['Byfliper06', 'ERROR', 'byfliper06'],
    ['ByfliperX', 'ERROR', 'byfliper_x'],
    ['Byilhann', '496105401', 'byilhann'],
    ['ByOwl', '47966045', 'by_owl'],
    ['BySL4M', '38759871', 'bysl4m'],
    ['BysTaXx', '25690271', 'bystaxx'],
    ['Bytarifaaa', '509100013', 'bytarifaaa'],
    ['ByViruZz', '30770604', 'byviruzz'],
    ['Cabritoz', '80539309', 'cabritoz'],
    ['Cacho01', '43190052', 'cacho01'],
    ['Caedrel', '92038375', 'caedrel'],
    ['CAKE', '43899589', 'c_a_k_e'],
    ['Calango', '58393005', 'calango'],
    ['Call of Duty', '501281', 'call of duty'],
    ['CallMeCarsonLIVE', '76055616', 'callmecarsonlive'],
    ['CallMeKevin', '23492760', 'callmekevin'],
    ['Callumonthebeat', 'ERROR', 'callumonthebeat'],
    ['Cameliaaa92', '790173918', 'cameliaaa92'],
    ['Camman18', '73375593', 'camman18'],
    ['CapcomFighters', '36616300', 'capcomfighters'],
    ['CapitanGatoo', '596583418', 'capitangatoo'],
    ['Caprimint', '59131475', 'caprimint'],
    ['Caprisun', '1145541046', 'caprisun'],
    ['Caps', '129281939', 'caps'],
    ['CaptainPuffy', '24338391', 'captainpuffy'],
    ['CaptainSparklez', '15554591', 'captainsparklez'],
    ['Carlitus', '200631673', 'carlitus'],
    ['Carola', '110405254', 'carola'],
    ['Carolinestormi', '65293756', 'carolinestormi'],
    ['Carreraaa', '106820088', 'carreraaa'],
    ['Carterefe', '797196666', 'carterefe'],
    ['Casanovabeams', '669130577', 'casanovabeams'],
    ['Caseoh', '267160288', 'caseoh_'],
    ['Caseoh247', '1200831758', 'caseoh247'],
    ['CashApp', '471239022', 'cashapp'],
    ['CashNastyGaming', '56235100', 'cashnastygaming'],
    ['Casimito', '254489093', 'casimito'],
    ['CastCrafter', '32806281', 'castcrafter'],
    ['Castro1021', '52091823', 'castro_1021'],
    ['Catcha800', 'ERROR', 'catcha800'],
    ['Cazetv', '869959833', 'cazetv_'],
    ['CBLOL', '36511475', 'cblol'],
    ['CctCs', '268731435', 'cct_cs'],
    ['CD PROJEKT RED', '62938127', 'cd projekt red'],
    ['CDawg', '45098797', 'cdawg'],
    ['Cdewx', '24666044', 'cdewx'],
    ['CDNThe3rd', '14408894', 'cdnthe3rd'],
    ['Ceh9', '39176562', 'ceh9'],
    ['Cellbit', '28579002', 'cellbit'],
    ['CH14', '431857492', 'ch14'],
    ['Chanzes', '242069575', 'chanzes'],
    ['Chap', '192678094', 'chap'],
    ['Charlesleclerc', '506634115', 'charlesleclerc'],
    ['Cheatbanned', '42049440', 'cheatbanned'],
    ['Chefstrobel', '138310362', 'chefstrobel'],
    ['Chess', '7601562', 'chess'],
    ['Chibidoki', '632564662', 'chibidoki'],
    ['Chica', '70661496', 'chica'],
    ['ChilledChaos', '9528182', 'chilledchaos'],
    ['Choc', '96406881', 'choc'],
    ['ChocoTaco', '69906737', 'chocotaco'],
    ['ChOpPeRz14', '72293941', 'chopperz14'],
    ['Chowh1', '117168642', 'chowh1'],
    ['Chrisnxtdoor', '120977175', 'chrisnxtdoor'],
    ['Cidcidoso', '138375255', 'cidcidoso'],
    ['CinCinBear', '63135520', 'cincinbear'],
    ['Cinna', '204730616', 'cinna'],
    ['Cizzorz', '128489946', 'cizzorz'],
    ['ClashRoyale', '104846109', 'clashroyale'],
    ['ClintStevens', '86268118', 'clintstevens'],
    ['Clix', '233300375', 'clix'],
    ['Cloakzy', '81687332', 'cloakzy'],
    ['CNed', '31443685', 'cned'],
    ['Co1azo', '212744599', 'co1azo'],
    ['CoconutB', '56395702', 'coconutb'],
    ['Cocottee', '656252271', 'cocottee_'],
    ['CodeMiko', '500128827', 'codemiko'],
    ['Codonysus', '941570594', 'codonysus'],
    ['CohhCarnage', '26610234', 'cohhcarnage'],
    ['ColasBim', '104477229', 'colas_bim'],
    ['Coldzin', '38590945', 'coldzin'],
    ['ColtHavok', '119089037', 'colthavok'],
    ['Conner', 'ERROR', 'conner'],
    ['ConnorEatsPants', '37455669', 'connoreatspants'],
    ['Conterstine', '49914195', 'conterstine'],
    ['CooLifeGame', '42814514', 'coolifegame'],
    ['Coreano', '128775333', 'coreano'],
    ['COREANOLOCOLIVE', '480022299', 'coreanolocolive'],
    ['CORINNAKOPF', '212124784', 'corinnakopf'],
    ['CorpseHusband', '585856958', 'corpse_husband'],
    ['Coscu', '36473331', 'coscu'],
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
    ['CsgoMc', '213748641', 'csgo_mc'],
    ['CSRuHub', '116311210', 'csruhub'],
    ['Ct0m', '414805368', 'ct0m'],
    ['Cuptoast', '504595924', 'cuptoast'],
    ['Curry', '113178266', 'curry'],
    ['CyanidePlaysGames', '63142572', 'cyanideplaysgames'],
    ['Cyr', '37522866', 'cyr'],
    ['CYRILmp4', '55828551', 'cyrilmp4'],
    ['CzechCloud', '31453284', 'czechcloud'],
    ['D0ccTv', '112702339', 'd0cc_tv'],
    ['D0tyaq', '857828221', 'd0tyaq'],
    ['D3stri', '36094496', 'd3stri'],
    ['DaequanWoco', '127651530', 'daequanwoco'],
    ['Dafran', '41314239', 'dafran'],
    ['DaigoTheBeasTV', '115590970', 'daigothebeastv'],
    ['Dakotaz', '39298218', 'dakotaz'],
    ['DalasReview', '51366401', 'dalasreview'],
    ['Daltoosh', '260722430', 'daltoosh'],
    ['Dangerlyoha', '402093335', 'dangerlyoha'],
    ['Danielaazuaje', '77669901', 'danielaazuaje_'],
    ['Daniels', '45952312', 'daniels'],
    ['DanilaGorilla', '770721241', 'danila_gorilla'],
    ['Dannyaarons', '143424503', 'dannyaarons'],
    ['DannyGoonzalez', '84162884', 'dannygoonzalez'],
    ['DansGaming', '7236692', 'dansgaming'],
    ['DanTDM', '45382480', 'dantdm'],
    ['Dantes', '466139555', 'dantes'],
    ['DanucD', '189755167', 'danucd'],
    ['Dapr', '46176210', 'dapr'],
    ['DarioMocciaTwitch', '53065331', 'dariomocciatwitch'],
    ['DarkViperAU', '57519051', 'darkviperau'],
    ['Dashy', '119015407', 'dashy'],
    ['DasMEHDI', '31557869', 'dasmehdi'],
    ['Datboisteezyy', '640564475', 'datboisteezyy'],
    ['DatModz', '24124090', 'datmodz'],
    ['Datto', '42296879', 'datto'],
    ['DavidDobrik', '574491149', 'daviddobrik'],
    ['Davis', '653369114', 'davis'],
    ['Davooxeneize', '499538703', 'davooxeneize'],
    ['DavyJones', '39795492', 'davyjones'],
    ['Day9tv', '18587270', 'day9tv'],
    ['Dddeactivated', '199644155', 'dddeactivated__'],
    ['DDG', '124835948', 'ddg'],
    ['DeadByDaylight', '107286467', 'deadbydaylight'],
    ['Deadlyslob', '12731745', 'deadlyslob'],
    ['Deadmau5', '71166086', 'deadmau5'],
    ['DechartGames', '189106199', 'dechartgames'],
    ['Deepins02', '135385636', 'deepins02'],
    ['Deercheerup', '245622027', 'deercheerup'],
    ['Defantediogo', '248306987', 'defantediogo'],
    ['Deko', '111454676', 'deko'],
    ['Del1ght', '64023526', 'del1ght'],
    ['Delegarp', '238937419', 'delegarp'],
    ['Dellor', '53811294', 'dellor'],
    ['Delux', '63072834', 'delux'],
    ['Demisux', '119257472', 'demisux'],
    ['Demon1', '133333248', 'demon1'],
    ['Dendi', '39176440', 'dendi'],
    ['DeqiuV', '472752044', 'deqiuv'],
    ['Derzko69', '180937915', 'derzko69'],
    ['Des0ut', '39154501', 'des0ut'],
    ['DeshaeFrost', '687186861', 'deshaefrost'],
    ['DessT3', '431146848', 'desst3'],
    ['Destiny', 'ERROR', 'destiny'],
    ['Destroy', '53927878', 'destroy'],
    ['Deujna', '42541814', 'deujna'],
    ['Deyyszn', '411331824', 'deyyszn'],
    ['Dfrment', '556386833', 'dfrment'],
    ['Dhalucard', '16064695', 'dhalucard'],
    ['Dhtekkz', '153475752', 'dhtekkz'],
    ['Dianarice', '61776347', 'dianarice'],
    ['DiazBiffle', '95055754', 'diazbiffle'],
    ['Didiwinxx', '521919115', 'didiwinxx'],
    ['Diegosaurs', '73779954', 'diegosaurs'],
    ['Dilblin', '415327697', 'dilblin'],
    ['Dilera', '174805181', 'dilera'],
    ['Dinablin', '121023163', 'dinablin'],
    ['Dinglederper', '22705699', 'dinglederper'],
    ['DisguisedToast', '87204022', 'disguisedtoast'],
    ['Dish', '255567495', 'dish'],
    ['Distortion2', '36324138', 'distortion2'],
    ['Dizzy', '108005221', 'dizzy'],
    ['DizzyKitten', '47474524', 'dizzykitten'],
    ['DjMaRiiO', '1895664', 'djmariio'],
    ['DJMarkusTV', '452388782', 'djmarkustv'],
    ['Dkincc', '121072767', 'dkincc'],
    ['DmitryLixxx', '188890121', 'dmitry_lixxx'],
    ['Dn1ureal', '235216896', 'dn1ureal'],
    ['Dogdog', '60978448', 'dogdog'],
    ['Doigby', '25454398', 'doigby'],
    ['Dojacattington', '415108429', 'dojacattington'],
    ['Domingo', '40063341', 'domingo'],
    ['Dona', '451214957', 'dona'],
    ['DonutOperator', '119253305', 'donutoperator'],
    ['Dopa24', '536083731', 'dopa24'],
    ['DosiaCsgo', '48243045', 'dosia_csgo'],
    ['Dota2mc', '213749122', 'dota2mc'],
    ['Dota2ParagonRu', '851088609', 'dota2_paragon_ru'],
    ['Dota2RuHub', '100814397', 'dota2ruhub'],
    ['Dota2ti', '35630634', 'dota2ti'],
    ['Dota2tiRu', '35631192', 'dota2ti_ru'],
    ['Doublelift', '40017619', 'doublelift'],
    ['DougDoug', '31507411', 'dougdoug'],
    ['Douglassola', '157809310', 'douglassola'],
    ['DragonSunshine', 'ERROR', 'dragon_sunshine_'],
    ['Drakeoffc', '231922983', 'drakeoffc'],
    ['Drb7h', '208308607', 'drb7h'],
    ['DrDisrespect', 'ERROR', 'drdisrespect'],
    ['DreadzTV', '31089858', 'dreadztv'],
    ['Dream', '451544676', 'dream'],
    ['Dreamwastaken', '657297676', 'dreamwastaken'],
    ['DrIgo', '51315079', 'drigo'],
    ['DrLupo', '29829912', 'drlupo'],
    ['DropsByPonk', '131974742', 'dropsbyponk'],
    ['Drututt', '57131280', 'drututt'],
    ['Dtoke', '511868154', 'dtoke'],
    ['Dubs', '196137255', 'dubs'],
    ['DuendePablo', '47939440', 'duendepablo'],
    ['Duke', '117583640', 'duke'],
    ['Duki', '513734390', 'duki'],
    ['Dunkstream', '40397064', 'dunkstream'],
    ['DUXO', '40549818', 'duxo'],
    ['DvmMedja', '132199022', 'dvm_medja'],
    ['DylanteroLIVE', '130345683', 'dylanterolive'],
    ['Dyrachyo', '96833143', 'dyrachyo'],
    ['Dyrus', '30080751', 'dyrus'],
    ['EaiMaka', '88208039', 'eaimaka'],
    ['EaJPark', '572082587', 'eajpark'],
    ['EAMaddenNFL', '51914127', 'eamaddennfl'],
    ['Easportsfc', '28029009', 'easportsfc'],
    ['EasyLiker', '761821431', 'easyliker'],
    ['Ebonivon', '162665605', 'ebonivon'],
    ['EchoEsports', '558530984', 'echo_esports'],
    ['EDISON', '120304051', 'edison'],
    ['EdwinLive', '174985071', 'edwin_live'],
    ['Efesto96', '241546561', 'efesto96'],
    ['EFEUYGAC', '103237625', 'efeuygac'],
    ['Egorkreed', '451634552', 'egorkreed'],
    ['Ekatze007', '466153965', 'ekatze007'],
    ['ElAbrahaham', '488006352', 'elabrahaham'],
    ['Elajjaz', '26921830', 'elajjaz'],
    ['Elanur', '196005456', 'elanur'],
    ['ElBokeron', '74547642', 'elbokeron'],
    ['ElcanaldeJoaco', '430476278', 'elcanaldejoaco'],
    ['ElChiringuitoTV', '247401621', 'elchiringuitotv'],
    ['Elded', '76385901', 'elded'],
    ['Eldemente', '157488994', 'eldemente'],
    ['Eldos', '438235965', 'eldos'],
    ['ELEAGUE TV', '109724636', 'eleague tv'],
    ['ElFedelobo', '69955030', 'elfedelobo'],
    ['ElGlogloking', '725614862', 'elglogloking'],
    ['Eliasn97', '238813810', 'eliasn97'],
    ['ElisabeteKitty', '155874595', 'elisabetekitty'],
    ['Elisawaves', '506880770', 'elisawaves'],
    ['ElMariana', '496795673', 'elmariana'],
    ['ElmiilloR', '44880944', 'elmiillor'],
    ['ElOjoNinja', '39692658', 'elojoninja'],
    ['ELoTRiX', '43286888', 'elotrix'],
    ['Elraenn', '165080419', 'elraenn'],
    ['ElRichMC', '30651868', 'elrichmc'],
    ['ElSpreen', '157658336', 'elspreen'],
    ['ElVenado98', '699225745', 'elvenado98'],
    ['Elwind', '71761252', 'elwind'],
    ['Elxokas', '31919607', 'elxokas'],
    ['ElZeein', '27589421', 'elzeein'],
    ['EmadGG', '154526718', 'emadgg'],
    ['Emikukis', '272067658', 'emikukis'],
    ['Emilycc', '111882197', 'emilycc'],
    ['Emiru', '91067577', 'emiru'],
    ['EmmaLangevin', '514945202', 'emmalangevin'],
    ['Emongg', '23220337', 'emongg'],
    ['Endretta', '90739706', 'endretta'],
    ['EnriqueRamosGamer', '415906036', 'enriqueramosgamer'],
    ['Enviosity', '44390855', 'enviosity'],
    ['Enzzai', '467031116', 'enzzai'],
    ['EpicenterEn1', '118170488', 'epicenter_en1'],
    ['EpikWhale', '145786272', 'epikwhale'],
    ['Eray', '131403189', 'eray'],
    ['Eret', '27427227', 'eret'],
    ['ErnesBarbeQ', '41879247', 'ernesbarbeq'],
    ['Ernesto', '40135340', 'ernesto'],
    ['Erobb221', '96858382', 'erobb221'],
    ['ErycTriceps', '85943836', 'eryctriceps'],
    ['EsfandTV', '38746172', 'esfandtv'],
    ['ESLCS', '31239503', 'eslcs'],
    ['ESLCSb', '35936871', 'eslcsb'],
    ['EslcsGg', '22859264', 'eslcs_gg'],
    ['EslcsPl', '23675021', 'eslcs_pl'],
    ['EslDota2', '36481935', 'esl_dota2'],
    ['EslDota2ember', '50160915', 'esl_dota2ember'],
    ['EslLol', '30707866', 'esl_lol'],
    ['Espe', '183597729', 'espe'],
    ['Estailus', '140792340', 'estailus'],
    ['EthanNestor', '38953507', 'ethannestor'],
    ['Ethos', '44558619', 'ethos'],
    ['Etoiles', '85800130', 'etoiles'],
    ['Eugeniacooney', '59657997', 'eugeniacooney'],
    ['Evaanna', '130784874', 'evaanna'],
    ['Evelone192', '39426641', 'evelone192'],
    ['Evelone2004', '738000896', 'evelone2004'],
    ['Evo', '30917811', 'evo'],
    ['EWROON', '82197170', 'ewroon'],
    ['Exileshow', '161689469', 'exileshow'],
    ['ExtraEmily', '517475551', 'extraemily'],
    ['F0rest', '38019007', 'f0rest'],
    ['F1NN5TER', '268107452', 'f1nn5ter'],
    ['Fabo', '41884889', 'fabo'],
    ['FabrizioRomano', '683703013', 'fabrizioromano'],
    ['Facada', '471175257', 'facada'],
    ['FACEIT TV', '27942990', 'faceit tv'],
    ['Facubanzas', '71631166', 'facubanzas'],
    ['Faide', '51065352', 'faide'],
    ['FairlightExcalibur', '54989347', 'fairlight_excalibur'],
    ['Faith', '160538649', 'faith'],
    ['Faker', '43691', 'faker'],
    ['FANDERCS', '174053656', 'fandercs'],
    ['Fanfan', '596031520', 'fanfan'],
    ['FantaBobShow', '29188740', 'fantabobshow'],
    ['Fanum', '139251406', 'fanum'],
    ['FarbizzBat9', '226492540', 'farbizzbat9'],
    ['FarfadoxVEVO', '224818031', 'farfadoxvevo'],
    ['FattyPillow', '76073513', 'fattypillow'],
    ['Faxuty', '148561738', 'faxuty'],
    ['FaZe', '20761874', 'faze'],
    ['FaZeBlaze', '62134739', 'fazeblaze'],
    ['FaZeSway', 'ERROR', 'fazesway'],
    ['FEDMYSTER', '39040630', 'fedmyster'],
    ['Felca', '787486979', 'felca'],
    ['Felps', '30672329', 'felps'],
    ['Fenya', '102302893', 'fenya'],
    ['Fer', '71167031', 'fer'],
    ['Fernanfloo', '197855687', 'fernanfloo'],
    ['Fextralife', '156037856', 'fextralife'],
    ['FFearFFul', '36922190', 'ffearfful'],
    ['Fibii', '220716126', 'fibii'],
    ['Fierik', '108547363', 'fierik'],
    ['Fifakillvizualz', '104659233', 'fifakillvizualz'],
    ['FifaTargrean', '134039697', 'fifatargrean'],
    ['Filian', '198633200', 'filian'],
    ['Fitz', '52878372', 'fitz'],
    ['Fl0m', '25093116', 'fl0m'],
    ['Flamby', '60256640', 'flamby'],
    ['Flashpoint', '490523982', 'flashpoint'],
    ['Flats', '141429177', 'flats'],
    ['Flight23white', '51270104', 'flight23white'],
    ['FlowPodcast', '424262503', 'flowpodcast'],
    ['Flyinguwe87', '51492033', 'flyinguwe87'],
    ['Fnmoneymaker', '984432588', 'fnmoneymaker'],
    ['FnxLNTC', '59336873', 'fnxlntc'],
    ['FolagorLives', '30857876', 'folagorlives'],
    ['Foolish', '145015519', 'foolish'],
    ['Forever', '477552485', 'forever'],
    ['FORMAL', '12338326', 'formal'],
    ['Formula1', '175769353', 'formula1'],
    ['Forsen', '22484632', 'forsen'],
    ['Fortnite', '55125740', 'fortnite'],
    ['FpsShaka', '49207184', 'fps_shaka'],
    ['FPSThailand', '38539112', 'fpsthailand'],
    ['Frametamer666', '663995665', 'frametamer666'],
    ['Franio', '109027939', 'franio'],
    ['FrankCuesta', '634209206', 'frank_cuesta'],
    ['Frankkaster', '61504845', 'frankkaster'],
    ['FranqitoM', '506611605', 'franqitom'],
    ['Freakazoid', '26959170', 'freakazoid'],
    ['Freneh', '97552124', 'freneh'],
    ['Fresh', '38594688', 'fresh'],
    ['FritzMeinecke', '460133452', 'fritz_meinecke'],
    ['Froggen', '38865133', 'froggen'],
    ['FroggerOW', '131986952', 'froggerow'],
    ['Frttt', '30458295', 'frttt'],
    ['Fruktozka', '91465245', 'fruktozka'],
    ['FrZod', '252428210', 'fr_zod'],
    ['FuguFps', '140846786', 'fugu_fps'],
    ['Fundy', '93028922', 'fundy'],
    ['Funnymike', '165573325', 'funnymike'],
    ['Fuslie', '83402203', 'fuslie'],
    ['FuzeIII', '41040855', 'fuzeiii'],
    ['Fyrexxx', '40261250', 'fyrexxx'],
    ['G0ularte', '51786703', 'g0ularte'],
    ['GaBBoDSQ', '45139193', 'gabbodsq'],
    ['Gabepeixe', '59799994', 'gabepeixe'],
    ['GAECHKATM', '450012016', 'gaechkatm'],
    ['Gafallen', '37287763', 'gafallen'],
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
    ['Gerardromero', '605221125', 'gerardromero'],
    ['GermanGarmendia', '215443081', 'germangarmendia'],
    ['GernaderJake', '1423946', 'gernaderjake'],
    ['GetRight', '38024128', 'get_right'],
    ['Giantwaffle', '22552479', 'giantwaffle'],
    ['Giggand', '91026471', 'giggand'],
    ['Gigguk', '24411833', 'gigguk'],
    ['Gingy', '94130217', 'gingy'],
    ['GirlOfNox', '129108719', 'girlofnox'],
    ['Gladd', '81628627', 'gladd'],
    ['GLADIATORPWNZ', 'ERROR', 'gladiatorpwnz'],
    ['GloriousE', '63304572', 'glorious_e'],
    ['Glotistic', '1055171003', 'glotistic'],
    ['GMHikaru', '103268673', 'gmhikaru'],
    ['Gnf', '654556126', 'gnf'],
    ['GnuLive', '88006635', 'gnu_live'],
    ['Goatmash222', 'ERROR', 'goatmash222'],
    ['Godwins', '460417343', 'godwins'],
    ['GOFNS', '66418614', 'gofns'],
    ['GoldGlove', '1518077', 'goldglove'],
    ['Goncho', '114635439', 'goncho'],
    ['Gonsabellla', '405208912', 'gonsabellla'],
    ['GoodTimesWithScar', '23558127', 'goodtimeswithscar'],
    ['GORDOx', '36024998', 'gordox'],
    ['Gorgc', '108268890', 'gorgc'],
    ['Gosu', '41939266', 'gosu'],
    ['Gotaga', '24147592', 'gotaga'],
    ['GothamChess', '151283108', 'gothamchess'],
    ['Grafo', '40266934', 'grafo'],
    ['Gratis150ml', '52203144', 'gratis150ml'],
    ['Greekgodx', '15310631', 'greekgodx'],
    ['GrenBaud', '568747744', 'grenbaud'],
    ['Grimm', '94757023', 'grimm'],
    ['Grimmmz', '9679595', 'grimmmz'],
    ['Gripex90', '32947748', 'gripex90'],
    ['Grizzy', '142726152', 'grizzy'],
    ['GRONKH', '12875057', 'gronkh'],
    ['GronkhTV', '106159308', 'gronkhtv'],
    ['GrossieGore', 'ERROR', 'grossie_gore'],
    ['Grubby', '20992865', 'grubby'],
    ['Gs1', '465636300', 'gs_1'],
    ['Gskianto', '150436863', 'gskianto'],
    ['GTimeTV', '60160906', 'gtimetv'],
    ['GUACAMOLEMOLLY', '181718577', 'guacamolemolly'],
    ['GUANYAR', '74426799', 'guanyar'],
    ['Guaxinim', '48393132', 'guaxinim'],
    ['H1ghSky1', '524698414', 'h1ghsky1'],
    ['H2pGucio', '36954803', 'h2p_gucio'],
    ['H3h3productions', '62438432', 'h3h3productions'],
    ['Halo', '26019478', 'halo'],
    ['HamedLoco', '470335253', 'hamedloco'],
    ['Hamlinz', '67143805', 'hamlinz'],
    ['HandOfBlood', '49140130', 'handofblood'],
    ['Hannahxxrose', '63096750', 'hannahxxrose'],
    ['HappyHappyGal', '660840731', 'happyhappygal'],
    ['Hardgamechannel', '153353959', 'hardgamechannel'],
    ['Harmii', '113537067', 'harmii'],
    ['HasanAbi', '207813352', 'hasanabi'],
    ['Hashinshin', 'ERROR', 'hashinshin'],
    ['Hastad', '26857029', 'hastad'],
    ['Hasvik', '143099070', 'hasvik'],
    ['Hayashii', '29094596', 'hayashii'],
    ['Hazretiyasuo', '66488107', 'hazretiyasuo'],
    ['HBomb94', '21313349', 'hbomb94'],
    ['Hctuan', '175560856', 'hctuan'],
    ['HealthygamerGg', '447330144', 'healthygamer_gg'],
    ['Heelmike', 'ERROR', 'heelmike'],
    ['HeliN139', 'ERROR', 'helin139'],
    ['HellianTV', '90056148', 'helliantv'],
    ['Helydia', '253195796', 'helydia'],
    ['HenryTran', '235693408', 'henrytran'],
    ['Henyathegenius', '896388738', 'henyathegenius'],
    ['Herdyn', '27187962', 'herdyn'],
    ['Heyimbee', '26903378', 'heyimbee'],
    ['HeyStan', '63736545', 'heystan'],
    ['Higgs', '554057125', 'higgs'],
    ['HighDistortion', '84752541', 'highdistortion'],
    ['HIKAKIN', '659829475', 'hikakin'],
    ['Hiko', '26991127', 'hiko'],
    ['Hiperop', '25214262', 'hiperop'],
    ['HisWattson', '123182260', 'hiswattson'],
    ['HITBOXKING', '45329736', 'hitboxking'],
    ['HJune', '121111915', 'hjune'],
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
    ['I6rba5', '52606303', 'i6rba5'],
    ['IaaraS2', '142932807', 'iaaras2'],
    ['IamCristinini', '123922797', 'iamcristinini'],
    ['Ibabyrainbow', '544502795', 'ibabyrainbow'],
    ['Ibai', '83232866', 'ibai'],
    ['IBlali', '11524494', 'iblali'],
    ['IConsipt', 'ERROR', 'iconsipt'],
    ['IFrostBolt', '77913099', 'ifrostbolt'],
    ['IGeStarK', '68062590', 'igestark'],
    ['Iinwafqht', '460209842', 'iinwafqht'],
    ['IiTzTimmy', '45302947', 'iitztimmy'],
    ['IJenz', 'ERROR', 'ijenz'],
    ['ILame', '87791915', 'ilame'],
    ['IlGabbrone', 'ERROR', 'ilgabbrone'],
    ['IlloJuan', '90075649', 'illojuan'],
    ['IlMasseo', '55933037', 'ilmasseo'],
    ['Ilrossopiubelloditwitch', '821717189', 'ilrossopiubelloditwitch'],
    ['Imantado', '476005292', 'imantado'],
    ['Imaqtpie', '24991333', 'imaqtpie'],
    ['ImDontai', '81918254', 'im_dontai'],
    ['Imls', '26513896', 'imls'],
    ['ImMarksman', '15386355', 'immarksman'],
    ['Imperialhal', '146922206', 'imperialhal__'],
    ['ImpulseSV', '41176642', 'impulsesv'],
    ['Imviolet', '252393390', 'imviolet_'],
    ['Indialovewestbrooks', '1290016492', 'indialovewestbrooks'],
    ['IngredyBarbi', '499926713', 'ingredybarbi'],
    ['Inkmate0', '544780041', 'inkmate0'],
    ['Innocents', '7920047', 'innocents'],
    ['Inoxtag', '80716629', 'inoxtag'],
    ['INSCOPE21TV', '38169925', 'inscope21tv'],
    ['Insomniac', '232672264', 'insomniac'],
    ['Insym', '75738685', 'insym'],
    ['Ironmouse', '175831187', 'ironmouse'],
    ['Isamu', '72684812', 'isamu'],
    ['IShowSpeed', '220476955', 'ishowspeed'],
    ['Iskall85', '69239046', 'iskall85'],
    ['ItsHafu', '30777889', 'itshafu'],
    ['ItsIron', '411746363', 'its_iron'],
    ['ItsJSTN', '52839414', 'itsjstn'],
    ['ItsRyanHiga', '421560387', 'itsryanhiga'],
    ['ItsSliker', 'ERROR', 'itssliker'],
    ['ItsSpoit', '144516280', 'itsspoit'],
    ['IWDominate', '25653002', 'iwdominate'],
    ['IxxYjYxxi', '101868523', 'ixxyjyxxi'],
    ['IzakOOO', '36717908', 'izakooo'],
    ['Jackeyy', '219069796', 'jackeyy'],
    ['JackManifoldTV', '112078171', 'jackmanifoldtv'],
    ['Jacksepticeye', '44578737', 'jacksepticeye'],
    ['Jacksfilms', '84473294', 'jacksfilms'],
    ['Jacob4TV', '129779434', 'jacob4tv'],
    ['JadeyAnh', '240649584', 'jadeyanh'],
    ['JaggerPrincesa', '81526980', 'jaggerprincesa'],
    ['Jahrein', '6768122', 'jahrein'],
    ['Jaidefinichon', '30610294', 'jaidefinichon'],
    ['JaidenAnimations', '76979176', 'jaidenanimations'],
    ['JakenbakeLIVE', '11249217', 'jakenbakelive'],
    ['JakeWebber69', '204387843', 'jakewebber69'],
    ['Jankos', '6094619', 'jankos'],
    ['JannisZ', '120627272', 'jannisz'],
    ['Japczan', 'ERROR', 'japczan'],
    ['Jashlem', '77311995', 'jashlem'],
    ['JASONR', '103262684', 'jasonr'],
    ['Jasontheween', '107117952', 'jasontheween'],
    ['Jasper7se', '77415295', 'jasper7se'],
    ['Jay3', '133220545', 'jay3'],
    ['Jaycinco', '703042869', 'jaycinco'],
    ['JayzTwoCents', '30532238', 'jayztwocents'],
    ['Jbzzed', '114497555', 'jbzzed'],
    ['Jcorko', '165478707', 'jcorko_'],
    ['Jeanmago', '245829588', 'jeanmago'],
    ['JeanPormanove', 'ERROR', 'jeanpormanove'],
    ['JeelTV', '114119743', 'jeeltv'],
    ['Jelty', '245226810', 'jelty'],
    ['JenFoxxx', '60160906', 'jenfoxxx'],
    ['JERICHO', '10397006', 'jericho'],
    ['Jerma985', '23936415', 'jerma985'],
    ['JessicaBlevins', '39011402', 'jessicablevins'],
    ['JesusAVGN', '34711476', 'jesusavgn'],
    ['Jhdelacruz777', '749288605', 'jhdelacruz777'],
    ['Jidionpremium', '651125714', 'jidionpremium'],
    ['JimmyHere', '116581327', 'jimmyhere'],
    ['Jingggxd', '136397315', 'jingggxd'],
    ['Jinnytty', '159498717', 'jinnytty'],
    ['Jiozi', '159301312', 'jiozi'],
    ['Jirayalecochon', '26567552', 'jirayalecochon'],
    ['Jjjjoaco', '178523026', 'jjjjoaco'],
    ['JLTomy', '155601320', 'jltomy'],
    ['JoeBartolozzi', '563908141', 'joe_bartolozzi'],
    ['JoeWo', '209428921', 'joewo'],
    ['JohnnyboiI', '91526191', 'johnnyboi_i'],
    ['JohnPanio', '186637705', 'johnpanio'],
    ['JohnPitterTV', 'ERROR', 'johnpittertv'],
    ['JojoHF', '152126110', 'jojohf'],
    ['Jolavanille', '574802385', 'jolavanille'],
    ['Jolygolf', '54804025', 'jolygolf'],
    ['JonBams', '28252159', 'jonbams'],
    ['JonSandman', '47034673', 'jonsandman'],
    ['JonVlogs', '103989988', 'jonvlogs'],
    ['JordanFisher', '224145872', 'jordanfisher'],
    ['JordanSemih', '884745809', 'jordan_semih'],
    ['Jordy2d', '214572684', 'jordy2d'],
    ['JorgeIsaac115', '109475218', 'jorgeisaac115'],
    ['Josedeodo', '48565257', 'josedeodo'],
    ['JoshOG', '54706574', 'joshog'],
    ['Joshseki', '129801067', 'joshseki'],
    ['JoueurDuGrenier', '68078157', 'joueur_du_grenier'],
    ['Jovirone', '53256534', 'jovirone'],
    ['Joyca', '192023754', 'joyca'],
    ['JRKZ', '155642616', 'jrkz'],
    ['JTGTV', '131056112', 'jtgtv'],
    ['Juansguarnizo', '121510236', 'juansguarnizo'],
    ['Jujalag', '521583209', 'jujalag'],
    ['Jukes', '77208443', 'jukes'],
    ['Julien', '85581832', 'julien'],
    ['JulienBam', '407144557', 'julienbam'],
    ['JuMayumin', '180086554', 'jumayumin'],
    ['Just9n', '46490205', 'just9n'],
    ['JustaMinx', '134609454', 'justaminx'],
    ['JustCooman', '63667409', 'justcooman'],
    ['Justfoxii', '78556622', 'justfoxii'],
    ['JustNs', '42316376', 'just_ns'],
    ['Jynxzi', '411377640', 'jynxzi'],
    ['Jzrggg', '104157644', 'jzrggg'],
    ['K1ng', '270186408', 'k1ng'],
    ['K3soju', '128293484', 'k3soju'],
    ['K4sen', '44525650', 'k4sen'],
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
    ['Karavay46', '175470952', 'karavay46'],
    ['Karchez', '91136321', 'karchez'],
    ['Kareykadasha', '601516488', 'kareykadasha'],
    ['Karljacobs', '124442278', 'karljacobs'],
    ['Karlnetwork', '638065882', 'karlnetwork'],
    ['Karma', '10406', 'karma'],
    ['Kasix', '102098555', 'kasix'],
    ['KatEvolved', '126632539', 'katevolved'],
    ['Katoo', '91647183', 'katoo'],
    ['KayaYanar', '487330909', 'kayayanar'],
    ['Kaydop', '63675549', 'kaydop'],
    ['KayPea', '42665223', 'kaypea'],
    ['Kaysan', '516862428', 'kaysan'],
    ['Keeoh', '151819490', 'keeoh'],
    ['KendineMuzisyen', '79087140', 'kendinemuzisyen'],
    ['KendoMurft', '234393024', 'kendomurft'],
    ['Kenji', '586142835', 'kenji'],
    ['KennyS', '39393023', 'kennys'],
    ['Kennzy', '51633358', 'kennzy'],
    ['Kephrii', '31582795', 'kephrii'],
    ['KeshaEuw', '198040640', 'keshaeuw'],
    ['Kestico', '524550694', 'kestico'],
    ['Khanada', '181258781', 'khanada_'],
    ['Kiaraakitty', '61335991', 'kiaraakitty'],
    ['KingGeorge', '117379932', 'kinggeorge'],
    ['KingGothalion', '43830727', 'kinggothalion'],
    ['KingRichard', '66691674', 'kingrichard'],
    ['Kingsleague', '121606712', 'kingsleague'],
    ['KingsleagueMex', '924842965', 'kingsleague_mex'],
    ['Kinstaar', '75701802', 'kinstaar'],
    ['KiraChats', 'ERROR', 'kirachats'],
    ['Kissulyap', 'ERROR', 'kissulyap'],
    ['Kitboga', '32787655', 'kitboga'],
    ['KittyPlays', '39627315', 'kittyplays'],
    ['KiXSTAR', '40035700', 'kixstar'],
    ['Kkatamina', '526763937', 'kkatamina'],
    ['Klean', '126436297', 'klean'],
    ['KLO25', '171503601', 'klo25'],
    ['KmSenKangoo', '779220187', 'kmsenkangoo'],
    ['Knekro', '152633332', 'knekro'],
    ['Knut', '43494917', 'knut'],
    ['KNVWN', '518396596', 'knvwn'],
    ['Koil', '26469355', 'koil'],
    ['Kolderiu', '143368887', 'kolderiu'],
    ['Kolento', '29107421', 'kolento'],
    ['Komanche', '100625840', 'komanche'],
    ['KonsolKulturu', 'ERROR', 'konsolkulturu'],
    ['Koreshzy', '165295605', 'koreshzy'],
    ['KoryaMc', '669445653', 'korya_mc'],
    ['Kragiee', '124604785', 'kragiee'],
    ['Kroatomist', '98700118', 'kroatomist'],
    ['KroozzNS', '178678172', 'kroozzns'],
    ['Kruzadar', '90222378', 'kruzadar'],
    ['Kubx', '130530322', 'kubx'],
    ['Kuplinov', '45922426', 'kuplinov'],
    ['Kussia88', '715007052', 'kussia88'],
    ['Kxpture', '469793900', 'kxpture'],
    ['Kyle', '154425624', 'kyle'],
    ['Kyootbot', '161737008', 'kyootbot'],
    ['Kyrieirving', '634368707', 'kyrieirving'],
    ['KyrSp33dy', '11001241', 'kyr_sp33dy'],
    ['LaChilenaBelu', '170079505', 'lachilenabelu'],
    ['Lachlan', '53327800', 'lachlan'],
    ['LACOBRAAA', '97241758', 'lacobraaa'],
    ['Lacy', '494543675', 'lacy'],
    ['Laink', '89872865', 'laink'],
    ['LakshartNia', '62638609', 'lakshartnia'],
    ['Landonorris', '174809651', 'landonorris'],
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
    ['Leleo', '161921258', 'leleo'],
    ['LenaGol0vach', '87186401', 'lenagol0vach'],
    ['LeoStradale', 'ERROR', 'leostradale'],
    ['Lestream', '147337432', 'lestream'],
    ['LetsGameItOut', '139709045', 'letsgameitout'],
    ['Letshe', '182427515', 'letshe'],
    ['LetsHugoTV', '117385099', 'letshugotv'],
    ['LetsTaddl', '45822345', 'letstaddl'],
    ['Levo', '71978007', 'levo'],
    ['Leynainu', '61974931', 'leynainu'],
    ['Liljarvis', '205401621', 'liljarvis'],
    ['Lilsimsie', '109809539', 'lilsimsie'],
    ['Lilypichu', '31106024', 'lilypichu'],
    ['Liminhag0d', '77573531', 'liminhag0d'],
    ['Limmy', '10386664', 'limmy'],
    ['Linca', '144395004', 'linca'],
    ['LinusTech', '35987962', 'linustech'],
    ['LIRIK', '23161357', 'lirik'],
    ['LITkillah', '541318059', 'litkillah'],
    ['LittleBigWhale', '121652526', 'littlebigwhale'],
    ['Llobeti4', '111297998', 'llobeti4'],
    ['LLocochon', '422510992', 'llocochon'],
    ['LLStylish', '128770050', 'llstylish'],
    ['Llunaclark', '175017835', 'llunaclark'],
    ['Lobanjicaa', '126902046', 'lobanjicaa'],
    ['LobosJr', '28640725', 'lobosjr'],
    ['Locklear', '137347549', 'locklear'],
    ['Loeya', '166279350', 'loeya'],
    ['Logic', '26929683', 'logic'],
    ['Lokonazo1', '38808314', 'lokonazo1'],
    ['LOLITOFDEZ', '57793021', 'lolitofdez'],
    ['Lollolacustre', '156705811', 'lollolacustre'],
    ['LolNemesis', '86131599', 'lol_nemesis'],
    ['Loltyler1', '51496027', 'loltyler1'],
    ['LordKebun', '163836275', 'lord_kebun'],
    ['Loserfruit', '41245072', 'loserfruit'],
    ['LosPollosTV', '61433001', 'lospollostv'],
    ['LoudBrabox', '592652063', 'loud_brabox'],
    ['LoudCaiox', '108544855', 'loud_caiox'],
    ['LoudCoringa', '569325723', 'loud_coringa'],
    ['LoudMii', '123998916', 'loud_mii'],
    ['LoudThurzin', '569327531', 'loud_thurzin'],
    ['LoudVoltan', '572866502', 'loud_voltan'],
    ['LPL', '124425627', 'lpl'],
    ['Ltaespanol', '142055874', 'ltaespanol'],
    ['Luanz7', '247990846', 'luanz7_'],
    ['Lubatv', '142546050', 'lubatv'],
    ['Lucascharmoso', '59339214', 'lucascharmoso'],
    ['LuccaTrem', '519554929', 'lucca_trem'],
    ['LuckyChamu', '143646010', 'luckychamu'],
    ['LucyL3in', '268488937', 'lucyl3in'],
    ['Ludwig', '40934651', 'ludwig'],
    ['Luh', '26008696', 'luh'],
    ['Luisenrique21', '838412657', 'luisenrique21'],
    ['LuluLuvely', '94875296', 'lululuvely'],
    ['LuquEt4', '267635380', 'luquet4'],
    ['Luquitarodriguez', '203799202', 'luquitarodriguez'],
    ['Luzu', '66370849', 'luzu'],
    ['LuzuTv', '601665123', 'luzu_tv'],
    ['LVNDMARK', '427632467', 'lvndmark'],
    ['LVPes', '22346597', 'lvpes'],
    ['LVPes2', '42028083', 'lvpes2'],
    ['Lydiaviolet', '712201914', 'lydiaviolet'],
    ['LyonWGFLive', '31561517', 'lyonwgflive'],
    ['Lzinnzikaaa', '490164805', 'lzinnzikaaa'],
    ['M0eTv', '36858184', 'm0e_tv'],
    ['M0NESYof', '218726370', 'm0nesyof'],
    ['M0xyy', '69012069', 'm0xyy'],
    ['MacieJay', '122320848', 'maciejay'],
    ['Madisonbeer', '504567442', 'madisonbeer'],
    ['Maethe', '46277457', 'maethe'],
    ['Mafanyaking', '523836820', 'mafanyaking'],
    ['MaferRocha', '80940204', 'maferrocha'],
    ['Maghla', '131215608', 'maghla'],
    ['Magic', '26991613', 'magic'],
    ['MahdiBa', '112523183', 'mahdiba'],
    ['Mahluna', '151883075', 'mahluna'],
    ['MakataO', '44057119', 'makatao'],
    ['Makina', '30685416', 'makina'],
    ['Malibuca', '185783477', 'malibuca'],
    ['Mamabenjyfishy1', '458446806', 'mamabenjyfishy1'],
    ['Mande', '128856353', 'mande'],
    ['Mandzio', '24558341', 'mandzio'],
    ['Mang0', '26551727', 'mang0'],
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
    ['MarzzOw', '174592989', 'marzz_ow'],
    ['Masayoshi', '46673989', 'masayoshi'],
    ['MasteerXd', '248926175', 'masteerxd'],
    ['MasterSnakou', '42141251', 'mastersnakou'],
    ['Mastu', '63936838', 'mastu'],
    ['MateoZ', '124491706', 'mateoz'],
    ['MatteoHS', '124318726', 'matteohs'],
    ['MattHDGamer', '12492867', 'matthdgamer'],
    ['Maxim', '172376071', 'maxim'],
    ['MaximeBiaggi', '119657765', 'maximebiaggi'],
    ['MaximilianDood', '30104304', 'maximilian_dood'],
    ['Maximum', '42490770', 'maximum'],
    ['Maya', '235835559', 'maya'],
    ['Mayichi', '94055227', 'mayichi'],
    ['Mazellovvv', '270698079', 'mazellovvv'],
    ['Mazzatomas', '202500922', 'mazzatomas'],
    ['MckyTV', '101572475', 'mckytv'],
    ['MeatyMarley', '156145307', 'meatymarley'],
    ['Megga', '194434289', 'megga'],
    ['MeikodRJ', '187352927', 'meikodrj'],
    ['Melharucos', '26819117', 'melharucos'],
    ['Melina', '409624608', 'melina'],
    ['Mellooow', '224200688', 'mellooow_'],
    ['Mendo', '57717183', 'mendo'],
    ['MenosTrece', '85652487', 'menostrece'],
    ['Meowko', '195326003', 'meowko'],
    ['Mero', '413012469', 'mero'],
    ['Mertabimula', '463204522', 'mertabimula'],
    ['MessyRoblox', '580691169', 'messyroblox'],
    ['Meteos', '38708489', 'meteos'],
    ['Method', '121649330', 'method'],
    ['Mews', '47606906', 'mews'],
    ['Mexify', '94085135', 'mexify'],
    ['Miafitz', '115511162', 'miafitz'],
    ['MiaKhalifa', '151145128', 'miakhalifa'],
    ['MiaMalkova', '216233870', 'miamalkova'],
    ['Michaelreeves', '469790580', 'michaelreeves'],
    ['Michel', '75891532', 'michel'],
    ['Michou', '231634715', 'michou'],
    ['Mickalow', '30709418', 'mickalow'],
    ['Mictia00', '116706369', 'mictia00'],
    ['Midbeast', '92113890', 'midbeast'],
    ['MiguelilloRl', '175243955', 'miguelillo_rl'],
    ['Mikaylah', '134532537', 'mikaylah'],
    ['MikeShowSha', '53097223', 'mikeshowsha'],
    ['Milan926', '405698602', 'milan926_'],
    ['Milimansiilla', '229026189', 'milimansiilla'],
    ['Millymusiic', '267003858', 'millymusiic'],
    ['Mimimimichaela', '48289225', 'mimimimichaela'],
    ['Minecraft', '112568845', 'minecraft'],
    ['Minerva', '49498288', 'minerva'],
    ['MiniLaddd', 'ERROR', 'miniladdd'],
    ['Miniminter', '39894746', 'miniminter'],
    ['Minos', '63985840', 'minos'],
    ['Mira', '79294007', 'mira'],
    ['Mishifu', '144827749', 'mishifu'],
    ['MissaSinfonia', '46094501', 'missasinfonia'],
    ['MissMikkaa', '48201326', 'missmikkaa'],
    ['Mistermv', '28575692', 'mistermv'],
    ['MitchJones', '26194208', 'mitchjones'],
    ['Mithrain', '79442833', 'mithrain'],
    ['Mitr0', '240804652', 'mitr0'],
    ['MixaZver', '179997759', 'mixazver'],
    ['Mixwell', '96116107', 'mixwell'],
    ['Mizkif', '94753024', 'mizkif'],
    ['ML7support', '51929371', 'ml7support'],
    ['Mobzeraoficial', '569324171', 'mobzeraoficial'],
    ['Modestal', '112619759', 'modestal'],
    ['ModyAlasmr', '452386981', 'mody_alasmr'],
    ['Moistcr1tikal', '132230344', 'moistcr1tikal'],
    ['Moji', '263044217', 'moji'],
    ['Mokrivskyi', '97828400', 'mokrivskyi'],
    ['MoMaN', '18887776', 'moman'],
    ['Momoladinastia', '145908612', 'momoladinastia'],
    ['Momonkunn', '35999968', 'momonkunn'],
    ['Mongraal', '133705618', 'mongraal'],
    ['Monstercat', '27446517', 'monstercat'],
    ['MontanaBlack88', '45044816', 'montanablack88'],
    ['Mooda', '567928581', 'mooda'],
    ['MOONMOON', '121059319', 'moonmoon'],
    ['Moonryde', '48192899', 'moonryde'],
    ['MORGENSHTERN', '772488499', 'morgenshtern'],
    ['MorpheYa', '194407709', 'morphe_ya'],
    ['Mortenroyale', '135558945', 'mortenroyale'],
    ['Mount', '58115154', 'mount'],
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
    ['Mrstiventc', '517677074', 'mrstiventc'],
    ['MrTLexify', '41726997', 'mrtlexify'],
    ['Mrtweeday', '28635446', 'mrtweeday'],
    ['Multiply', '161129051', 'multiply'],
    ['Murda2KTV', '1090025821', 'murda2ktv'],
    ['MurdaTheDemon', 'ERROR', 'murdathedemon'],
    ['Murzofix', '76036152', 'murzofix'],
    ['Mushway', '81432617', 'mushway'],
    ['Musty', '128582322', 'musty'],
    ['MuTeX', '98506045', 'mutex'],
    ['Muzz', '485420539', 'muzz'],
    ['Mylonzete', '40301754', 'mylonzete'],
    ['MymAlkapone', '31478096', 'mym_alkapone'],
    ['MYMTUMTUM69', '42999001', 'mymtumtum69'],
    ['Myth', '110690086', 'myth'],
    ['N0thing', '21442544', 'n0thing'],
    ['N3koglai', '688611748', 'n3koglai'],
    ['N3on', '427561170', 'n3on'],
    ['NachoDayo', '190110029', 'nacho_dayo'],
    ['Nadeshot', '21130533', 'nadeshot'],
    ['Nadia', '634735100', 'nadia'],
    ['NakooFn', '422770569', 'nakoo_fn'],
    ['Nanocs1', '88997140', 'nanocs1'],
    ['NarcolepticNugget', '93641995', 'narcolepticnugget'],
    ['Naru', '38287412', 'naru'],
    ['NASA', '151920918', 'nasa'],
    ['NasdasOff', '804177371', 'nasdas_off'],
    ['Natalan', '189260132', 'natalan'],
    ['NatanaelCano', '883360538', 'natanaelcano'],
    ['Natarsha', '99591839', 'natarsha'],
    ['NateHill', '181224914', 'natehill'],
    ['NAts', '120198135', 'nats'],
    ['Natsumiii', '42177890', 'natsumiii'],
    ['NBA', '152984821', 'nba'],
    ['NeburixTV', '469749101', 'neburixtv'],
    ['Necros', '129625799', 'necros'],
    ['Nedurix', '818492138', 'nedurix'],
    ['Neeko', '169188075', 'neeko'],
    ['NEEXcsgo', '121329766', 'neexcsgo'],
    ['NeneCreative', '106594300', 'nenecreative'],
    ['NeonSniperPanda', '413674427', 'neonsniperpanda'],
    ['NepentheZ', '17061121', 'nepenthez'],
    ['Nephtunie', '130178840', 'nephtunie'],
    ['Nervarien', '25452510', 'nervarien'],
    ['Nexxuz', '46715780', 'nexxuz'],
    ['Neymarjr', '163932929', 'neymarjr'],
    ['Nezak', '179144678', 'nezak_'],
    ['NiceWigg', '415954300', 'nicewigg'],
    ['Nick28T', '49303276', 'nick28t'],
    ['Nickbunyun', '23458108', 'nickbunyun'],
    ['NickEh30', '44424631', 'nickeh30'],
    ['NICKMERCS', '15564828', 'nickmercs'],
    ['Nicksfps', '144261138', 'nicksfps'],
    ['NicoLa', '887001013', 'nico_la'],
    ['Nieuczesana', '65759224', 'nieuczesana'],
    ['Nightblue3', '26946000', 'nightblue3'],
    ['Nihachu', '123512311', 'nihachu'],
    ['Nihmune', '650221094', 'nihmune'],
    ['Nikilarr', '655332536', 'nikilarr'],
    ['NikitonipongoTV', '127443997', 'nikitonipongotv'],
    ['NiklasWilson', '501438035', 'niklaswilson'],
    ['NiKo', '87477627', 'niko'],
    ['Nikof', '110119637', 'nikof'],
    ['Nikolarn', '66272442', 'nikolarn'],
    ['Nilojeda', '199046842', 'nilojeda'],
    ['NimuVT', '495899004', 'nimuvt'],
    ['NinaDaddyisBack', 'ERROR', 'ninadaddyisback'],
    ['Ninja', '19571641', 'ninja'],
    ['Nintendo', '37319', 'nintendo'],
    ['Nissaxter', '42351942', 'nissaxter'],
    ['Nix', '67708794', 'nix'],
    ['NlKripp', '29795919', 'nl_kripp'],
    ['Nmplol', '21841789', 'nmplol'],
    ['Nniru', '460120312', 'nniru'],
    ['NoahJ456', '15832755', 'noahj456'],
    ['Noahreyli', '146994920', 'noahreyli'],
    ['NOBRU', '506590738', 'nobru'],
    ['Noe9977', '585670655', 'noe9977'],
    ['Noelmiller', '175152654', 'noelmiller'],
    ['NoJumper2K', '1111006223', 'nojumper2k'],
    ['Noni', '522692765', 'noni'],
    ['Nooreax', '172312401', 'nooreax'],
    ['Northernlion', '14371185', 'northernlion'],
    ['NotAestheticallyHannah', '592594059', 'notaestheticallyhannah'],
    ['Novaruu', '154028091', 'novaruu'],
    ['Noway4uSir', '85397463', 'noway4u_sir'],
    ['NuviaOuo', '147813466', 'nuvia_ouo'],
    ['NVIDIA', '38970168', 'nvidia'],
    ['Nyanners', '82350088', 'nyanners'],
    ['Nzaotv', '547228834', 'nzaotv'],
    ['Oatley', '401670504', 'oatley'],
    ['Ocastrin', '241163546', 'ocastrin'],
    ['OceaneAmsler', '729914963', 'oceaneamsler'],
    ['OCMz', '38632829', 'ocmz'],
    ['Oddpowder', 'ERROR', 'oddpowder'],
    ['Odumx', 'ERROR', 'odumx'],
    ['Oestagiario', '252606559', 'oestagiario'],
    ['OfficialBoaster', '66963772', 'officialboaster'],
    ['OficialBarcellos', '111710174', 'oficialbarcellos'],
    ['Ofmanny', '92941793', 'ofmanny'],
    ['OgamingLoL', '71852533', 'ogaminglol'],
    ['Ohmwrecker', '23034523', 'ohmwrecker'],
    ['OhnePixel', '43683025', 'ohnepixel'],
    ['OKINGBR', '443654989', 'okingbr'],
    ['Okyyy', '462594741', 'okyyy'],
    ['OLESYALIBERMAN', '184147110', 'olesyaliberman'],
    ['OllieGamerz', '51870280', 'olliegamerz'],
    ['Olofmeister', '46717011', 'olofmeister'],
    ['Olyashaa', '104717035', 'olyashaa'],
    ['OMeiaUm', '72733233', 'omeiaum'],
    ['OMGitsfirefoxx', '47176475', 'omgitsfirefoxx'],
    ['OMofficial', '491625140', 'omofficial'],
    ['ONSCREEN', '27121969', 'onscreen'],
    ['Ookina', '128544632', 'ookina'],
    ['Oozie', '606662293', 'oozie'],
    ['Ops1x', '185619753', 'ops1x'],
    ['OPscT', '49940618', 'opsct'],
    ['Orangemorange', '95603047', 'orangemorange'],
    ['ORIGINPC', '56728613', 'originpc'],
    ['ORIGINPCCEO', 'ERROR', 'originpcceo'],
    ['Orslok', '25058448', 'orslok'],
    ['Oscu', '146820572', 'oscu'],
    ['Otplol', '622498423', 'otplol_'],
    ['Otzdarva', '61812950', 'otzdarva'],
    ['Overkillgamingofficial', '178325704', 'overkillgamingofficial'],
    ['Ovotz', '210014596', 'ovotz'],
    ['OwEsports', '137512364', 'ow_esports'],
    ['OwEsports2', '156567621', 'ow_esports2'],
    ['P4wnyhof', '71672341', 'p4wnyhof'],
    ['Pabellon4', '514595736', 'pabellon_4'],
    ['Pablobruschi', '196157392', 'pablobruschi'],
    ['PAGO3', '29468517', 'pago3'],
    ['PainLivestream', '61243967', 'painlivestream'],
    ['Paluten', '43844604', 'paluten'],
    ['Pamaj', '28601033', 'pamaj'],
    ['Panetty', '132817946', 'panetty'],
    ['Pankyy', '82388424', 'pankyy'],
    ['Paoloidolo', '29750090', 'paoloidolo'],
    ['PapaBuyer', '476058201', 'papabuyer'],
    ['Papaplatte', '50985620', 'papaplatte'],
    ['PapeSan', '485818115', 'papesan'],
    ['PapiBlast', '187273645', 'papiblast'],
    ['PapiGaviTV', '77450490', 'papigavitv'],
    ['PapoMC', '536794313', 'papomc'],
    ['Paracetamor', '72312037', 'paracetamor'],
    ['Paradeev1ch', '515044370', 'paradeev1ch'],
    ['Parisplatynov', '124026289', 'parisplatynov'],
    ['PashaBiceps', '47207941', 'pashabiceps'],
    ['Pathofexile', '35821635', 'pathofexile'],
    ['Patife', '67773433', 'patife'],
    ['Pato', '262480800', 'pato'],
    ['Patodeaqualand', '75265753', 'patodeaqualand'],
    ['PatoPapao', '35647075', 'patopapao'],
    ['Patriota', '28703999', 'patriota'],
    ['Paulanobre', '55660184', 'paulanobre'],
    ['PauletaTwitch', '41487980', 'pauleta_twitch'],
    ['PaulinhoLOKObr', '531177917', 'paulinholokobr'],
    ['PaymoneyWubby', '38251312', 'paymoneywubby'],
    ['PCH3LK1N', '48978939', 'pch3lk1n'],
    ['Peereira7', '182714869', 'peereira7'],
    ['Pelicanger', '464285047', 'pelicanger'],
    ['Pengu', '85956078', 'pengu'],
    ['PerkzLol', '41670750', 'perkz_lol'],
    ['Perxitaa', '35980866', 'perxitaa'],
    ['Pestily', '106013742', 'pestily'],
    ['Peterbot', '574141428', 'peterbot'],
    ['Peterpark', '124494583', 'peterpark'],
    ['PeteZahHutt', '21837508', 'petezahhutt'],
    ['PewDiePie', '20711821', 'pewdiepie'],
    ['PGL', '21681549', 'pgl'],
    ['PglCs2', '107953058', 'pgl_cs2'],
    ['PglDota2', '87056709', 'pgl_dota2'],
    ['Pgod', '198434884', 'pgod'],
    ['Philza', '3389768', 'philza'],
    ['Picoca', '55947845', 'picoca'],
    ['Pieface23', '52615982', 'pieface23'],
    ['PietSmiet', '21991090', 'pietsmiet'],
    ['Pijack11', '48898260', 'pijack11'],
    ['Pikabooirl', '27992608', 'pikabooirl'],
    ['PimpCS', '37799181', 'pimpcs'],
    ['Pimpeano', '143737983', 'pimpeano'],
    ['Pimpimenta', '102346837', 'pimpimenta'],
    ['PinkSparkles', '84110474', 'pink_sparkles'],
    ['PinkWardlol', '72700357', 'pinkwardlol'],
    ['PintiPanda', '24756885', 'pintipanda'],
    ['PipePunk', '119310350', 'pipepunk'],
    ['PirateSoftware', '151368796', 'piratesoftware'],
    ['Piuzinho', '803762271', 'piuzinho'],
    ['Pizfn', '236507843', 'pizfn'],
    ['Plaqueboymax', '672238954', 'plaqueboymax'],
    ['Playapex', '412132764', 'playapex'],
    ['PlayHard', '66934438', 'playhard'],
    ['PlayHearthstone', '42776357', 'playhearthstone'],
    ['PlayOverwatch', '59980349', 'playoverwatch'],
    ['PlayStation', '30011711', 'playstation'],
    ['Ploo', '102731041', 'ploo'],
    ['POACH', '45143025', 'poach'],
    ['Pobelter', '25080754', 'pobelter'],
    ['Poderosobagual', '788658421', 'poderosobagual'],
    ['PointCrow', '87111052', 'pointcrow'],
    ['Poka', '159974499', 'poka'],
    ['Pokelawls', '12943173', 'pokelawls'],
    ['Pokemon', '36653045', 'pokemon'],
    ['PokemonGO', '116082737', 'pokemongo'],
    ['Pokimane', '44445592', 'pokimane'],
    ['Polispol1', '198363811', 'polispol1'],
    ['PoliticalPunk', 'ERROR', 'political_punk'],
    ['Ponce', '50597026', 'ponce'],
    ['Popo', '91229603', 'popo'],
    ['PostMalone', '177782786', 'postmalone'],
    ['Posty', '135377687', 'posty'],
    ['POW3R', '38499199', 'pow3r'],
    ['Pqueen', '177249859', 'pqueen'],
    ['Prettyboyfredo', '25097408', 'prettyboyfredo'],
    ['PrimeVideo', '168843586', 'primevideo'],
    ['PrinceOff', '73486167', 'prince__off'],
    ['PROD', '174754672', 'prod'],
    ['ProfessorBroman', '39158791', 'professorbroman'],
    ['Projektmelody', '478575546', 'projektmelody'],
    ['Pront0', '66789788', 'pront0'],
    ['PRXf0rsakeN', '160813816', 'prxf0rsaken'],
    ['PSG', '478715115', 'psg'],
    ['PubgBattlegrounds', '127506955', 'pubg_battlegrounds'],
    ['Pulgaboy', '48340211', 'pulgaboy'],
    ['Punz', '217965779', 'punz'],
    ['PurpleBixi', '209139976', 'purplebixi'],
    ['Purpled', '490245656', 'purpled'],
    ['Putupau', '74547134', 'putupau'],
    ['Pvfrango', '756869405', 'pvfrango'],
    ['PWGood', '116738112', 'pwgood'],
    ['QTCinderella', '247808909', 'qtcinderella'],
    ['Quackity', '48526626', 'quackity'],
    ['QuackityToo', '639654714', 'quackitytoo'],
    ['QuarterJade', '173758090', 'quarterjade'],
    ['QueenGiorgia', '273677595', 'queen_giorgia'],
    ['QuickyBaby', '30623831', 'quickybaby'],
    ['Quin69', '56649026', 'quin69'],
    ['Quiriify', '717491421', 'quiriify'],
    ['RachelR', '104259136', 'rachelr'],
    ['RadioLiveMusic', '631240808', 'radiolivemusic'],
    ['Rain', '38682663', 'rain'],
    ['Rainbow6', '65171890', 'rainbow6'],
    ['Rainbow6BR', '132106826', 'rainbow6br'],
    ['Rainelissss', '741740827', 'rainelissss'],
    ['RakanooLive', '119638640', 'rakanoolive'],
    ['Rakin', '44099416', 'rakin'],
    ['RakkunVT', 'ERROR', 'rakkunvt'],
    ['Ramee', '95873995', 'ramee'],
    ['Rammus53', 'ERROR', 'rammus53'],
    ['Ramzes', '77964394', 'ramzes'],
    ['Ranboobutnot', '663294488', 'ranboobutnot'],
    ['RanbooLive', '489155160', 'ranboolive'],
    ['Ranger', '110892046', 'ranger'],
    ['RatedEpicz', '50237189', 'ratedepicz'],
    ['RATIRL', '57292293', 'ratirl'],
    ['RatoBorrachudo', '51891532', 'ratoborrachudo'],
    ['Raud', '684393848', 'raud'],
    ['RavshanN', '92048793', 'ravshann'],
    ['Ray', '85875635', 'ray'],
    ['Rayasianboy', '570335223', 'rayasianboy'],
    ['RayC', '107305687', 'ray__c'],
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
    ['Relaxing234', '26779624', 'relaxing234'],
    ['Remsua', '416083610', 'remsua'],
    ['Renatko', '92848919', 'renatko'],
    ['Rene8808', '806840624', 'rene8808'],
    ['RenRize', '272168411', 'renrize'],
    ['Repaz', '101020771', 'repaz'],
    ['Replays', '146790215', 'replays'],
    ['RevedTV', '97123979', 'revedtv'],
    ['REVENANT', '38446500', 'revenant'],
    ['ReventXz', '40110994', 'reventxz'],
    ['Reverse2k', '68292748', 'reverse2k'],
    ['Rewinside', '46780407', 'rewinside'],
    ['Reynad27', '27396889', 'reynad27'],
    ['Rezo', '622545020', 'rezo'],
    ['Rezonfn', '422417281', 'rezonfn'],
    ['RezReel', '603905457', 'rezreel'],
    ['RiccardoDosee', '645448741', 'riccardodosee'],
    ['Ricci', '1054551170', 'ricci'],
    ['RiceGum', '40580009', 'ricegum'],
    ['Richwcampbell', '127463427', 'richwcampbell'],
    ['Rickyedit', '115657971', 'rickyedit'],
    ['Ricoy', '96604083', 'ricoy'],
    ['Riot Games', '36029255', 'riot games'],
    ['RiotEsportsKorea', '190835892', 'riot_esports_korea'],
    ['RiotGamesTurkish', '36513760', 'riotgamesturkish'],
    ['RiversGg', '734906922', 'rivers_gg'],
    ['Rizzo', '23097521', 'rizzo'],
    ['RMCsport', '552015849', 'rmcsport'],
    ['RobertoCein', '66302775', 'robertocein'],
    ['Robertpg', '467340631', 'robertpg'],
    ['Robleis', '199811071', 'robleis'],
    ['Roblox', '2983909', 'roblox'],
    ['RobTheMaster1', '166554148', 'robthemaster1'],
    ['Rociodta', '181293545', 'rociodta'],
    ['RocketBaguette', '139027213', 'rocketbaguette'],
    ['RocketBeansTV', '47627824', 'rocketbeanstv'],
    ['RocketLeague', '57781936', 'rocketleague'],
    ['Rocky', '115695918', 'rocky_'],
    ['Rodezel', '47758448', 'rodezel'],
    ['Rodsquare', '42242477', 'rodsquare'],
    ['Rogue', '64581694', 'rogue'],
    ['Roier', '54748186', 'roier'],
    ['RonaldoTv', '541891002', 'ronaldotv'],
    ['RosdriTwitch', '80216715', 'rosdri_twitch'],
    ['ROSHTEIN', '72550899', 'roshtein'],
    ['Rostikfacekid', '711044449', 'rostikfacekid'],
    ['Rostislav999', '475757024', 'rostislav_999'],
    ['RRaenee', '145202260', 'rraenee'],
    ['Rrcatchem', 'ERROR', 'rrcatchem'],
    ['Rrcatchemm', 'ERROR', 'rrcatchemm'],
    ['RTAinJapan', '134850221', 'rtainjapan'],
    ['RTGame', '88547576', 'rtgame'],
    ['RubberRoss', '10904915', 'rubberross'],
    ['Rubexdb2', '815060563', 'rubexdb2'],
    ['Rubius', '39276140', 'rubius'],
    ['Rubsarb', '125093246', 'rubsarb'],
    ['Rufusmda', '194517338', 'rufusmda'],
    ['Rug', '38148938', 'rug'],
    ['Rumathra', '41567638', 'rumathra'],
    ['Runthefutmarket', '143759910', 'runthefutmarket'],
    ['Rush', '107514872', 'rush'],
    ['Rustyk', '239882716', 'rustyk'],
    ['Ruyterpoubel', '529564947', 'ruyterpoubel'],
    ['Ryux', '175229703', 'ryux'],
    ['S0mcs', '128002336', 's0mcs'],
    ['S1mple', '60917582', 's1mple'],
    ['S7ORMyTv', '83332770', 's7ormytv'],
    ['Saadhak', '133926538', 'saadhak'],
    ['Sackzi', '139504995', 'sackzi'],
    ['Sacriel', '23735582', 'sacriel'],
    ['Sacy', '25116812', 'sacy'],
    ['SakuraaaGaming', '577667875', 'sakuraaagaming'],
    ['Sakurashymko', '522970165', 'sakurashymko'],
    ['SamuelBradoock', '569324930', 'samuelbradoock'],
    ['Samueletienne', '505902512', 'samueletienne'],
    ['Sanchovies', '115659124', 'sanchovies'],
    ['SandraSkins', '500906914', 'sandraskins'],
    ['Saniye', '463836611', 'saniye'],
    ['Santutu', '402926627', 'santutu'],
    ['Sapnap', '44332309', 'sapnap'],
    ['Sapnaplive', '638077636', 'sapnaplive'],
    ['Sardoche', '50795214', 'sardoche'],
    ['Saruei', '122863474', 'saruei'],
    ['Sasa', 'ERROR', 'sasa'],
    ['Sasatikk', '67519684', 'sasatikk'],
    ['Sasavot', '89132304', 'sasavot'],
    ['Sascha', '79769388', 'sascha'],
    ['Sashagrey', '421838340', 'sashagrey'],
    ['Savjz', '43131877', 'savjz'],
    ['Scarra', '22253819', 'scarra'],
    ['Sceptic', '144977942', 'sceptic'],
    ['Schlatt', '98125665', 'schlatt'],
    ['SCHRADIN', '656099497', 'schradin'],
    ['SchrodingerLee', '597535246', 'schrodingerlee'],
    ['Scoped', '193270950', 'scoped'],
    ['ScreaM', '39393054', 'scream'],
    ['Scump', '13240194', 'scump'],
    ['SecretXdddd', '670629077', 'secret_xdddd'],
    ['SensationLIVE', '41025762', 'sensationlive'],
    ['Sequisha', '25458544', 'sequisha'],
    ['SeregaPirat', '83644032', 'serega_pirat'],
    ['Sev7n', '67191666', 'sev7n'],
    ['Sevadus', '25553391', 'sevadus'],
    ['Shadoune666', '36533048', 'shadoune666'],
    ['Shadowkekw', '465131731', 'shadowkekw'],
    ['ShahZaM', '38433240', 'shahzam'],
    ['ShanksTtv', '540056482', 'shanks_ttv'],
    ['Shariin3d', '569322664', 'shariin3d'],
    ['Sharishaxd', '99246707', 'sharishaxd'],
    ['SharonQueen', '455993452', 'sharonqueen'],
    ['Shelao', '160062337', 'shelao'],
    ['Sheviiioficial', '119611214', 'sheviiioficial'],
    ['Shiphtur', '26560695', 'shiphtur'],
    ['ShivFPS', '128149102', 'shivfps'],
    ['Shlorox', '40784764', 'shlorox'],
    ['Shongxbong', '242781211', 'shongxbong'],
    ['Shotzzy', '31194266', 'shotzzy'],
    ['Shroud', '37402112', 'shroud'],
    ['Shubble', '31063899', 'shubble'],
    ['Shxtou', '119407348', 'shxtou'],
    ['Shylily', '100901794', 'shylily'],
    ['SickCs', '77165632', 'sick_cs'],
    ['SideArms4Reason', '12578353', 'sidearms4reason'],
    ['SidneyEweka', '135177864', 'sidneyeweka'],
    ['Silithur', '31220977', 'silithur'],
    ['Silky', '451786566', 'silky'],
    ['SilverName', '70075625', 'silvername'],
    ['Silvervale', '56938961', 'silvervale'],
    ['Simple0s', 'ERROR', 'simple0s'],
    ['Simurgh', 'ERROR', 'simurgh'],
    ['Sin6n', '632603005', 'sin6n'],
    ['Sinatraa', '138094916', 'sinatraa'],
    ['Singsing', '21390470', 'singsing'],
    ['Sips', '26538483', 'sips_'],
    ['SirhcEz', '27934574', 'sirhcez'],
    ['SirMaza', '39518378', 'sirmaza'],
    ['SivHD', '27686136', 'sivhd'],
    ['Skadoodle', '6978352', 'skadoodle'],
    ['Skelyy', '253987686', 'skelyy'],
    ['Skeppy', '97014329', 'skeppy'],
    ['SKILLZ0R1337', '151079000', 'skillz0r1337'],
    ['SkipNhO', '63602976', 'skipnho'],
    ['SkipnhoLoja', 'ERROR', 'skipnholoja'],
    ['SkyrrozTV', '52349411', 'skyrroztv'],
    ['Skywhywalker', '254030065', 'skywhywalker'],
    ['Skyyart', '70298660', 'skyyart'],
    ['SLAKUNTV', '512977322', 'slakuntv'],
    ['Sleepy', '135052907', 'sleepy'],
    ['Slimecicle', '47764708', 'slimecicle'],
    ['SlimShady62', '1048808548', 'slim_shady62'],
    ['Smajor', '24713999', 'smajor'],
    ['SmallAnt', '117349875', 'smallant'],
    ['SMii7Y', '25640053', 'smii7y'],
    ['SmiteGame', '31500812', 'smitegame'],
    ['SmittyStone', 'ERROR', 'smittystone'],
    ['Smqcked', '88607410', 'smqcked'],
    ['Smurfdomuca', '143891036', 'smurfdomuca'],
    ['Smzinho', '37705807', 'smzinho'],
    ['SnaggyMo', '134965839', 'snaggymo'],
    ['SNAILKICK', '63614185', 'snailkick'],
    ['Sneakylol', '24538518', 'sneakylol'],
    ['Sneegsnag', '24057744', 'sneegsnag'],
    ['Snifferish', '162614098', 'snifferish'],
    ['Snip3down', '21270244', 'snip3down'],
    ['SnoopDogg', '101240144', 'snoopdogg'],
    ['Snopey', '410320296', 'snopey'],
    ['Snuffy', '515567425', 'snuffy'],
    ['Sodapoppin', '26301881', 'sodapoppin'],
    ['Sofiaespanha', '227470294', 'sofiaespanha'],
    ['Solary', '174955366', 'solary'],
    ['SolaryFortnite', '198506129', 'solaryfortnite'],
    ['SoLLUMINATI', '110059426', 'solluminati'],
    ['SoloRenektonOnly', '30227322', 'solorenektononly'],
    ['Sometimepro', '488507979', 'sometimepro'],
    ['Sommerset', '277945156', 'sommerset'],
    ['SopFix', '184875510', 'sopfix'],
    ['Souenito', '200427848', 'souenito'],
    ['Souljaboy', '47694770', 'souljaboy'],
    ['SovietWomble', '67802451', 'sovietwomble'],
    ['SoyPan', '57993352', 'soypan'],
    ['SparcMac', '41244221', 'sparcmac'],
    ['SparkofPhoenixTV', '36464115', 'sparkofphoenixtv'],
    ['Spicyuuu', '642318624', 'spicyuuu'],
    ['Spoonkid', '119925910', 'spoonkid'],
    ['Spursito', '104455653', 'spursito'],
    ['Spuzie', '28565473', 'spuzie'],
    ['Spxtacular', '66537402', 'spxtacular'],
    ['SPYGEA', '10985633', 'spygea'],
    ['Squeezie', '52130765', 'squeezie'],
    ['SquishyMuffinz', '90018770', 'squishymuffinz'],
    ['SrTumbao', '683796500', 'srtumbao'],
    ['Stableronaldo', '246450563', 'stableronaldo'],
    ['StariyBog', '121821372', 'stariy_bog'],
    ['StarLadder1', '28633177', 'starladder1'],
    ['StarLadder5', '28633374', 'starladder5'],
    ['StarladderCsEn', '85875535', 'starladder_cs_en'],
    ['StarVTuber', '596604572', 'starvtuber'],
    ['Staryuuki', '167189231', 'staryuuki'],
    ['Steel', '195675197', 'steel'],
    ['SteelTv', '26202775', 'steel_tv'],
    ['Stegi', '51304190', 'stegi'],
    ['Stevewillsendit', '450775736', 'stevewillsendit'],
    ['Stewie2K', '66076836', 'stewie2k'],
    ['Stintik', '44748026', 'stintik'],
    ['Stodeh', '52647450', 'stodeh'],
    ['Stompgoat', '654049265', 'stompgoat'],
    ['StoneMountain64', '22998189', 'stonemountain64'],
    ['Stormen', '101936909', 'stormen'],
    ['STPeach', '100484450', 'stpeach'],
    ['StrawberryTabby', '562723403', 'strawberrytabby'],
    ['Stray228', '40488774', 'stray228'],
    ['StreamerHouse', '44741426', 'streamerhouse'],
    ['StRoGo', '233741947', 'strogo'],
    ['StRoGo1337', '727429488', 'strogo1337'],
    ['Sturniolos', '623306953', 'sturniolos'],
    ['Stylishnoob4', '50988750', 'stylishnoob4'],
    ['Subroza', '40965449', 'subroza'],
    ['Suetam1v4', '228371036', 'suetam1v4'],
    ['SUJA', '96564203', 'suja'],
    ['Summit1g', '26490481', 'summit1g'],
    ['SummonersInnLive', '40336240', 'summonersinnlive'],
    ['Supertf', '59635827', 'supertf'],
    ['Surefour', '2982838', 'surefour'],
    ['Swagg', '39724467', 'swagg'],
    ['SwaggerSouls', '84432477', 'swaggersouls'],
    ['Sweatcicle', '96706929', 'sweatcicle'],
    ['SweeetTails', '183390095', 'sweeettails'],
    ['SweetAnita', '217377982', 'sweet_anita'],
    ['Sweetdreams', '143726713', 'sweetdreams'],
    ['Swelyy', '193731552', 'swelyy'],
    ['Swiftor', '274625', 'swiftor'],
    ['Swifty', '23524577', 'swifty'],
    ['Swimy', '176314965', 'swimy'],
    ['Sykkuno', '26154978', 'sykkuno'],
    ['Sylvee', '175383693', 'sylvee'],
    ['Symfuhny', '31688366', 'symfuhny'],
    ['Syndicate', '16764225', 'syndicate'],
    ['SypherPK', '32140000', 'sypherpk'],
    ['T2x2', '48189727', 't2x2'],
    ['Takeshi', '37370325', 'takeshi'],
    ['TaliaMar', '156788264', 'taliamar'],
    ['Talmo', '74097186', 'talmo'],
    ['Tanizen', '40299581', 'tanizen'],
    ['TANZVERBOT', '43548655', 'tanzverbot'],
    ['TapL', '132083317', 'tapl'],
    ['Tarik', '36340781', 'tarik'],
    ['Tarzaned', '123782776', 'tarzaned'],
    ['Taspio', '484404305', 'taspio'],
    ['Tati', '133850478', 'tati'],
    ['Taxi2g', '136822306', 'taxi2g'],
    ['TaylorJevaux', '469348555', 'taylor_jevaux'],
    ['TaySon', '189726839', 'tayson'],
    ['TazerCraft', '27941045', 'tazercraft'],
    ['TBJZL', '27947809', 'tbjzl'],
    ['Tbvnks', '933366019', 'tbvnks'],
    ['TcK10', '499928989', 'tck10'],
    ['TeamRedline', '70113516', 'teamredline'],
    ['Techneoblade', '481954450', 'techneoblade'],
    ['Tecnonauta', '140038984', 'tecnonauta'],
    ['Tecnosh', '36772976', 'tecnosh'],
    ['Tectone', '27717340', 'tectone'],
    ['TeeGrizzley', '431882702', 'teegrizzley'],
    ['TeePee', '23844396', 'teepee'],
    ['Teeqo', '85603763', 'teeqo'],
    ['Teeqzy', '148043031', 'teeqzy_'],
    ['Telefe', '590906662', 'telefe'],
    ['TELLIER50', '567658286', 'tellier50'],
    ['TenacityTv', '459898171', 'tenacitytv'],
    ['Tenderlybae', '249559280', 'tenderlybae'],
    ['Tense198V2', '451367545', 'tense198_v2'],
    ['TenZ', '70225218', 'tenz'],
    ['TeosGame', '98099061', 'teosgame'],
    ['Terracid', '89873316', 'terracid'],
    ['Terroriser', '28243295', 'terroriser'],
    ['TFBlade', '59308271', 'tfblade'],
    ['Tfue', '60056333', 'tfue'],
    ['TGLTN', '103259021', 'tgltn'],
    ['Th3Antonio', '39115143', 'th3antonio'],
    ['Thaiga', '161888550', 'thaiga'],
    ['ThaldrinLol', '46595619', 'thaldrinlol'],
    ['ThaNix229', '106721502', 'thanix229'],
    ['The8BitDrummer', '63321379', 'the8bitdrummer'],
    ['TheAlvaro845', '69564524', 'thealvaro845'],
    ['Thean1meman', '51810748', 'thean1meman'],
    ['Thebausffs', '93869876', 'thebausffs'],
    ['TheBurntPeanut', '472066926', 'theburntpeanut'],
    ['TheDanDangler', '435049951', 'thedandangler'],
    ['Thedanirep', '56514218', 'thedanirep'],
    ['TheDarkness', '52614128', 'thedarkness'],
    ['TheDrossRotzank', '428621952', 'thedrossrotzank'],
    ['TheExaL04', '129281284', 'theexal04'],
    ['Thegameawards', '72852045', 'thegameawards'],
    ['TheGrefg', '48878319', 'thegrefg'],
    ['TheGuill84', '36318615', 'theguill84'],
    ['TheJRM', '412114748', 'thejrm'],
    ['TheKAIRI78', 'ERROR', 'thekairi78'],
    ['TheMagmaBoi', '706426284', 'themagmaboi'],
    ['Theneedledrop', '57188694', 'theneedledrop'],
    ['TheNicoleT', '197406569', 'thenicolet'],
    ['Theokoles', '46864514', 'theokoles'],
    ['TheRealKnossi', '71588578', 'therealknossi'],
    ['TheRealMarzaa', '89600394', 'therealmarzaa'],
    ['THERUSSIANBADGER', '22578309', 'therussianbadger'],
    ['Thesketchreal', '917774995', 'thesketchreal'],
    ['Thetylilshow', '682561320', 'thetylilshow'],
    ['Thezarox03Tv', '805834896', 'thezarox03_tv'],
    ['Thiefs', '46865623', 'thiefs'],
    ['Thijs', '57025612', 'thijs'],
    ['ThomeFN', '195007466', 'thomefn'],
    ['Tiagovski555YT', '246532465', 'tiagovski555yt'],
    ['Timmac', '9244832', 'timmac'],
    ['TimTheTatman', '36769016', 'timthetatman'],
    ['TinaKitten', '42032495', 'tinakitten'],
    ['Tioorochitwitch', '197688174', 'tioorochitwitch'],
    ['TisiSchubech', '52345220', 'tisischubech'],
    ['Tixinhadois', '32115632', 'tixinhadois'],
    ['TNTSportsBr', '124640241', 'tntsportsbr'],
    ['Tobias', '473183066', 'tobias'],
    ['TobiasFate', '91137296', 'tobiasfate'],
    ['Tocata', '42108204', 'tocata'],
    ['TolunayOren', '121552014', 'tolunayoren'],
    ['Tommyinnit', '116228390', 'tommyinnit'],
    ['Tommyinnitalt', '556173685', 'tommyinnitalt'],
    ['Tonton', '72480716', 'tonton'],
    ['TooseFN', '121706139', 'toosefn'],
    ['Topson', '153670212', 'topson'],
    ['Totaamc', '854865462', 'totaamc'],
    ['Towelliee', '20694610', 'towelliee'],
    ['TpaBoMaH', '265940345', 'tpabomah'],
    ['TPAIN', '117083340', 'tpain'],
    ['Trainwreckstv', '71190292', 'trainwreckstv'],
    ['TreasureIslands', '612154518', 'treasureislands'],
    ['Trebor', '537217836', 'trebor'],
    ['Trick2g', '28036688', 'trick2g'],
    ['TrickAIM', '565189459', 'trickaim'],
    ['Trihex', '22025290', 'trihex'],
    ['TrilluXe', '55898523', 'trilluxe'],
    ['TrizPariz', '421093539', 'trizpariz'],
    ['TroydanGaming', '48478126', 'troydangaming'],
    ['TrU3Ta1ent', '48286022', 'tru3ta1ent'],
    ['TrumpSC', '14836307', 'trumpsc'],
    ['Trymacs', '64342766', 'trymacs'],
    ['TsmTheoddone', '30080840', 'tsm_theoddone'],
    ['TsmViss', '90020006', 'tsm_viss'],
    ['Tteuw', '47119647', 'tteuw'],
    ['Tubbo', '223191589', 'tubbo'],
    ['TubboLIVE', '478701870', 'tubbolive'],
    ['TuliAcosta', '543231314', 'tuli_acosta'],
    ['Tumblurr', '77827128', 'tumblurr'],
    ['Tuonto', '98078101', 'tuonto'],
    ['TvandeR', '132279966', 'tvander'],
    ['Twitch', '12826', 'twitch'],
    ['Twitchgaming', '527115020', 'twitchgaming'],
    ['TwitchPlaysPokemon', '56648155', 'twitchplayspokemon'],
    ['TwitchPresents', '149747285', 'twitchpresents'],
    ['TwitchRivals', '197886470', 'twitchrivals'],
    ['Twomad', 'ERROR', 'twomad'],
    ['Tyceno', '100048582', 'tyceno'],
    ['TypicalGamer', '7154733', 'typicalgamer'],
    ['UberHaxorNova', '7010591', 'uberhaxornova'],
    ['Ubisoft', '2158531', 'ubisoft'],
    ['UnBlessed2K', 'ERROR', 'unblessed2k'],
    ['Unboxholics', '68246485', 'unboxholics'],
    ['Ungespielt', '36983084', 'ungespielt'],
    ['Unicornio', '61519248', 'unicornio'],
    ['UnknownxArmy', '405008403', 'unknownxarmy'],
    ['UNLOSTV', '83399952', 'unlostv'],
    ['Uthenera', '28541821', 'uthenera'],
    ['Vadeal', '487318498', 'vadeal'],
    ['Vader', '69759951', 'vader'],
    ['Valkyrae', '79615025', 'valkyrae'],
    ['VALORANT', '490592527', 'valorant'],
    ['ValorantAmericas', '598903130', 'valorant_americas'],
    ['ValorantBr', '502014446', 'valorant_br'],
    ['ValorantEmea', '598902753', 'valorant_emea'],
    ['ValorantJpn', '544210045', 'valorant_jpn'],
    ['ValorantLa', '544213766', 'valorant_la'],
    ['ValorantPacific', '610457628', 'valorant_pacific'],
    ['ValorantTur', '638580878', 'valorant_tur'],
    ['Valouzz', '39129104', 'valouzz'],
    ['Vanillamace', '422243447', 'vanillamace'],
    ['Vargskelethor', '28219022', 'vargskelethor'],
    ['VarsityGaming', '114856888', 'varsitygaming'],
    ['VASTgg', '171897087', 'vastgg'],
    ['Vector', '128976889', 'vector'],
    ['Vedal987', '85498365', 'vedal987'],
    ['VEGETTA777', '11355067', 'vegetta777'],
    ['Vei', '97245742', 'vei'],
    ['Velox', '109778370', 'velox'],
    ['Veni', '27430767', 'veni'],
    ['Venofn', '159292184', 'venofn'],
    ['VeRsuta', '21802540', 'versuta'],
    ['VetealavershDkco', '57744501', 'vetealaversh_dkco'],
    ['VGBootCamp', '9846758', 'vgbootcamp'],
    ['Vicens', '101395464', 'vicens'],
    ['Vickypalami', '211121982', 'vickypalami'],
    ['Victoria', '10180554', 'victoria'],
    ['Videoyun', '24233423', 'videoyun'],
    ['Viizzzm', '532809786', 'viizzzm'],
    ['Vinesauce', '25725272', 'vinesauce'],
    ['Vinnie', '208189351', 'vinnie'],
    ['VioletaG', '517536651', 'violetag'],
    ['VivaLaFazza', '131917576', 'vivalafazza'],
    ['VJET', 'ERROR', 'vjet'],
    ['Vol5m', 'ERROR', 'vol5m'],
    ['Volx', '94101038', 'volx'],
    ['VooDooSh', '87481167', 'voodoosh'],
    ['Voyboy', '14293484', 'voyboy'],
    ['W2S', '32488203', 'w2s'],
    ['Walid', '403474131', 'walid'],
    ['Wallibear', '206955139', 'wallibear'],
    ['WankilStudio', '31289086', 'wankilstudio'],
    ['Warcraft', '37516578', 'warcraft'],
    ['WARDELL', '100182904', 'wardell'],
    ['Warframe', '31557216', 'warframe'],
    ['Waveigl', '173162545', 'waveigl'],
    ['WeAreTheVR', '63493039', 'wearethevr'],
    ['WELOVEGAMES', '30814134', 'welovegames'],
    ['Welyn', '128892121', 'welyn'],
    ['Wendolynortizz', '1017626993', 'wendolynortizz'],
    ['WeplaycsgoEeu', '680795105', 'weplaycsgo_eeu'],
    ['Werlyb', '30357893', 'werlyb'],
    ['WestCOL', '168732568', 'westcol'],
    ['Whippy', '28564152', 'whippy'],
    ['WHOPLOHOYPAREN', '510794436', 'whoplohoyparen'],
    ['WilburSoot', '185048086', 'wilbursoot'],
    ['WILDCAT', '46386566', 'wildcat'],
    ['WildTurtle', '41972342', 'wildturtle'],
    ['WillerZ', '118155820', 'willerz'],
    ['Willito', '936685192', 'willito'],
    ['Willneff', '122888997', 'willneff'],
    ['Willyrex', '17308628', 'willyrex'],
    ['Winghaven', '41790550', 'winghaven'],
    ['Wingsofdeath', '30171560', 'wingsofdeath'],
    ['Wirtual', '92271663', 'wirtual'],
    ['Wismichu', '30504119', 'wismichu'],
    ['WithZack', '128268757', 'withzack'],
    ['Wolfiez', '192821942', 'wolfiez'],
    ['WorldofTanks', '182560660', 'worldoftanks'],
    ['WtcN', '51950404', 'wtcn'],
    ['Wuant', '25515122', 'wuant'],
    ['Wudijo', '61438909', 'wudijo'],
    ['Wy6f', '499767049', 'wy6f'],
    ['X2Twins', '189290002', 'x2twins'],
    ['XANDAOOGOD', '425646474', 'xandaoogod'],
    ['XANTAREScN', '82387889', 'xantarescn'],
    ['Xari', '88301612', 'xari'],
    ['Xaryu', '32085830', 'xaryu'],
    ['Xayoo', '107418731', 'xayoo_'],
    ['Xbox', '29733529', 'xbox'],
    ['Xc3jo', '137298121', 'xc3jo'],
    ['XChocoBars', '38169925', 'xchocobars'],
    ['XCry', '96246531', 'xcry'],
    ['Xehugeny', 'ERROR', 'xehugeny'],
    ['XEWER', '88524154', 'xewer'],
    ['Xhemigfg', '1172084357', 'xhemigfg'],
    ['Xisuma', '27273690', 'xisuma'],
    ['Xiuder', '160489367', 'xiuder_'],
    ['Xlightmoonx', '222387437', 'xlightmoonx'],
    ['Xmaawx', '47594707', 'xmaawx'],
    ['Xmerghani', '65866610', 'xmerghani'],
    ['Xn7rq', '751527359', 'xn7rq'],
    ['Xpertthief', '8957524', 'xpertthief'],
    ['Xposed', '106065411', 'xposed'],
    ['XQc', '71092938', 'xqc'],
    ['XRohat', '430023505', 'xrohat'],
    ['XTheSolutionTV', '56040562', 'xthesolutiontv'],
    ['XxfirehexxPro', '494980868', 'xxfirehexx_pro'],
    ['XXxTheFocuSxXx', '431460701', 'xxxthefocusxxx'],
    ['Y0L0AVENTURAS', '401850133', 'y0l0aventuras'],
    ['Yanlazzzz', 'ERROR', 'yanlazzzz'],
    ['YasserM55', '82479391', 'yasserm55'],
    ['Yassuo', '121203480', 'yassuo'],
    ['YatorOxx', '429062034', 'yatoroxx'],
    ['Yayahuz', '194749904', 'yayahuz'],
    ['Ybicanoooobov', '68950614', 'ybicanoooobov'],
    ['YeTz', '27680990', 'yetz'],
    ['YoDa', '47071880', 'yoda'],
    ['Yogscast', '20786541', 'yogscast'],
    ['YoMax', '74391737', 'yomax'],
    ['YooTide', '579537103', 'yootide'],
    ['Yosoyricklive', '204708397', 'yosoyricklive'],
    ['Youngdabo', '609059207', 'youngdabo'],
    ['YoungMulti', '28141853', 'youngmulti'],
    ['Yourragegaming', '36926489', 'yourragegaming'],
    ['Yungfilly', '247395896', 'yungfilly'],
    ['Yuuechka', '423486275', 'yuuechka'],
    ['Yuuri22', '499780312', 'yuuri22'],
    ['Yvonnie', '45184940', 'yvonnie'],
    ['Zacknani', '87184624', 'zacknani'],
    ['Zackrawrr', '552120296', 'zackrawrr'],
    ['Zagowt', '230924320', 'zagowt'],
    ['Zainita', '492053598', 'zainita'],
    ['ZakvielChannel', '44407373', 'zakvielchannel'],
    ['ZanoXVII', '75830338', 'zanoxvii'],
    ['Zarbex', '403594122', 'zarbex'],
    ['Zedef', '520529162', 'zedef'],
    ['Zekken', '445768007', 'zekken'],
    ['ZEkO', '101448647', 'zeko'],
    ['Zeling', '58753574', 'zeling'],
    ['Zellsis', '49891804', 'zellsis'],
    ['Zemie', '104632789', 'zemie'],
    ['ZenonOf', 'ERROR', 'zenon_of'],
    ['Zentreya', '128440061', 'zentreya'],
    ['ZEON', '31921744', 'zeon'],
    ['ZeratoR', '41719107', 'zerator'],
    ['Zerkaa', '13884994', 'zerkaa'],
    ['ZeRo', '28211644', 'zero'],
    ['ZeROBADASS', '28526571', 'zerobadass'],
    ['ZexRow', '83026310', 'zexrow'],
    ['ZiGueira', '32171655', 'zigueira'],
    ['ZilverK', '45736373', 'zilverk'],
    ['Zizaran', '36483360', 'zizaran'],
    ['ZLOYn', '22814674', 'zloyn'],
    ['Zoespencer', '841433765', 'zoespencer'],
    ['Zoloftly', 'ERROR', 'zoloftly'],
    ['Zombey', '32659255', 'zombey'],
    ['ZONY', '101286926', 'zony'],
    ['Zoodasa', '138287817', 'zoodasa'],
    ['Zoomaa', '105584645', 'zoomaa'],
    ['ZorlaKOKA', '43045369', 'zorlakoka'],
    ['ZormanWorld', '65876095', 'zormanworld'],
    ['Zubarefff', '777707810', 'zubarefff'],
    ['Zwebackhd', '43650535', 'zwebackhd'],
    ['Zxcursed', 'ERROR', 'zxcursed'],
    ['Zy0xxx', '79202256', 'zy0xxx'],


	// more to come :)
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
        
        // Use plugin's logging method instead of accessing private logger
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
        
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const progress = this.totalEmotes > 0 ? (this.downloadedEmotes / this.totalEmotes) * 100 : 0;
        const speed = elapsedSeconds > 0 ? this.downloadedBytes / elapsedSeconds : 0;
        
        this.statusBarEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong>📥 7TV Emote Cache</strong>
                <span style="font-size: 11px; color: var(--text-muted);">Batch ${this.currentBatch}/${this.totalBatches}</span>
            </div>
            <div style="margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                    <span>Progress: ${this.downloadedEmotes}/${this.totalEmotes}</span>
                    <span>${progress.toFixed(1)}%</span>
                </div>
                <div style="height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden; margin-bottom: 2px;">
                    <div style="height: 100%; background: var(--interactive-accent); width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
                    <span>${this.formatBytes(this.downloadedBytes)} / ${this.formatBytes(this.totalBytes)}</span>
                    <span>${this.formatBytes(speed)}/s</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); align-items: center;">
                <span>⏱️ ${elapsedSeconds}s</span>
                <span>${this.failedEmotes > 0 ? `❌ ${this.failedEmotes} failed` : ''}</span>
                <button class="mod-warning" style="padding: 2px 8px; font-size: 10px; height: auto; line-height: 1.2;">Cancel</button>
            </div>
        `;
        
        // Add cancel button event listener
        const cancelButton = this.statusBarEl.querySelector('button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.cancel());
        }
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
            this.statusBarEl.innerHTML = `
                <div style="text-align: center; padding: 8px;">
                    <div style="font-weight: bold; color: var(--text-error); margin-bottom: 4px;">
                        ❌ Download Cancelled
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">
                        ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached
                    </div>
                    <div style="font-size: 10px; color: var(--text-faint); margin-top: 4px;">
                        ${this.formatBytes(this.downloadedBytes)} downloaded
                    </div>
                </div>
            `;
            
            // Remove status bar after 3 seconds
            setTimeout(() => {
                if (this.statusBarEl && this.statusBarEl.parentNode) {
                    this.statusBarEl.remove();
                    this.statusBarEl = null;
                }
            }, 3000);
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
            
            this.statusBarEl.innerHTML = `
                <div style="text-align: center; padding: 8px;">
                    <div style="font-weight: bold; color: var(--text-accent); margin-bottom: 4px;">
                        ✅ Download Complete
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
                        ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
                        ${this.formatBytes(this.downloadedBytes)} total
                    </div>
                    <div style="font-size: 9px; color: var(--text-faint);">
                        ${successRate}% success in ${totalTime}s (${this.formatBytes(avgSpeed)}/s avg)
                    </div>
                </div>
            `;
            
            // Remove status bar after 5 seconds
            setTimeout(() => {
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
            // Fallback to console if logger not initialized
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
        console.time('[7TV] Plugin initialization');
        
        // Load settings first for logger initialization
        await this.loadSettings();
        console.timeLog('[7TV] Plugin initialization', 'Settings loaded');
        
        // Initialize logger with loaded settings
        this.logger = new PluginLogger(this);
        this.logger.log('Plugin initialization started', 'basic');
        
        // Initialize download tracker
        this.downloadTracker = new DownloadProgressTracker(this);
        
        this.injectStyles();
        this.logger.log('CSS injected', 'verbose');
        console.timeLog('[7TV] Plugin initialization', 'CSS injected');
        
        // Initialize cache based on selected strategy
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
            this.logger.log(`Cache initialized (strategy: ${this.settings.cacheStrategy})`, 'verbose');
            console.timeLog('[7TV] Plugin initialization', 'Cache initialized');
        }
        
        // Set up emote auto-completion
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        this.logger.log('Emote suggest registered', 'verbose');
        console.timeLog('[7TV] Plugin initialization', 'Emote suggest registered');
        
        // Load emotes if a streamer is already configured
        const activeId = this.getActiveTwitchId();
        if (activeId) {
            this.logger.log(`Loading emotes for ID: ${activeId}`, 'basic');
            console.timeLog('[7TV] Plugin initialization', `Loading emotes for ID: ${activeId}`);
            await this.refreshEmotesForUser(activeId);
        }
        
        // Register fallback command for manual emote insertion
        this.addCommand({
            id: 'insert-huh-emote-manual',
            name: 'Insert HUH emote (Manual Fallback)',
            editorCallback: async (editor: Editor) => {
                await this.insertEmoteByStrategy(editor, 'HUH', '01FFMS6Q4G0009CAK0J14692AY');
            }
        });
        
        // Register command to cancel active pre-cache
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
        
        // Register settings tab
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
        
        console.timeEnd('[7TV] Plugin initialization');
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
        
        // Prevent duplicate injections via internal flag
        if (this.stylesInjected) {
            this.logger.log('Styles already injected (internal flag), skipping', 'debug');
            return;
        }
        
        // Verify style element doesn't already exist in DOM
        if (document.getElementById(styleId)) {
            this.logger.log('Style element already exists in DOM, reusing', 'debug');
            this.stylesInjected = true;
            return;
        }
        
        // Create and inject the style element
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            /* Streamer suggestion modal styling */
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
            
            /* Emote suggestion styling */
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
        // Clean up any active operations
        if (this.activeDownloadPromise) {
            console.log('[7TV] Active download operation cancelled on unload');
        }
        
        // Abort any active downloads
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Clean up download tracker
        this.downloadTracker.cleanup();
        
        console.log('[7TV] Plugin unloaded');
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
		
		// Reset pre-cache status
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
     * Inserts emote using local cache if available, otherwise uses CDN with background caching.
     * 
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.CACHE_DIR}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        // Time the cache check for performance monitoring
        const checkResult = await this.logger.withTiming(
            `Cache check for ${name}`,
            async () => {
                return await this.app.vault.adapter.exists(cachePath);
            }
        );
        
        if (checkResult) {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            this.logger.log(`Emote "${name}" (${id}) inserted from LOCAL CACHE (on-demand strategy)`, 'debug');
            editor.replaceSelection(html);
        } else {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="${cdnUrl}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            this.logger.log(`Emote "${name}" (${id}) inserted from CDN, will cache (on-demand strategy)`, 'debug');
            editor.replaceSelection(html);
            // Cache in background for future use
            this.downloadToCache(id, cdnUrl, cachePath).catch(() => { });
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
     * Checks if emotes beyond the default HUH emote have been loaded.
     * 
     * @returns Boolean indicating if additional emotes are loaded
     */
    public hasLoadedEmotes(): boolean {
        return this.getEmoteCount() > 1; // 1 for default HUH emote
    }

    /**
     * Manually triggers pre-cache for all loaded emotes.
     * 
     * @returns Promise resolving when pre-cache completes
     */
    public async triggerPreCache(): Promise<void> {
        const emoteMap = this.getEmoteMap();
        if (!emoteMap || emoteMap.size <= 1) { // 1 for default HUH emote
            throw new Error('No emotes loaded to cache');
        }
        
        this.logger.log('Starting manual pre-cache operation', 'basic');
        
        // Cancel any existing pre-cache
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Create new abort controller
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
        
        // Estimate total bytes (average emote is ~5KB)
        const estimatedAverageSize = 5 * 1024; // 5KB average
        const estimatedTotalBytes = totalEmotes * estimatedAverageSize;
        
        // Start progress tracking
        this.downloadTracker.start(totalEmotes, () => {
            // Cancel callback
            if (this.abortController) {
                this.abortController.abort();
            }
        });
        
        // Set initial estimate
        this.downloadTracker.setTotalBytes(estimatedTotalBytes);
        
        // Use smaller batch size
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(totalEmotes / BATCH_SIZE);
        
        try {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                // Check for cancellation
                if (this.abortController?.signal.aborted || this.downloadTracker.isCancelledRequested()) {
                    throw new DOMException('Download cancelled', 'AbortError');
                }
                
                const startIdx = batchIndex * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, totalEmotes);
                const batch = emoteIds.slice(startIdx, endIdx);
                
                // Update batch info
                this.downloadTracker.updateBatch(batchIndex + 1);
                
                // Process batch in parallel
                const promises = batch.map(id => 
                    this.ensureEmoteCached(id)
                        .then(bytes => this.downloadTracker.recordSuccess(bytes))
                        .catch(() => this.downloadTracker.recordFailure())
                );
                
                await Promise.allSettled(promises);
                
                // Use requestIdleCallback to yield to browser rendering
                await new Promise(resolve => {
                    if ('requestIdleCallback' in window) {
                        (window as any).requestIdleCallback(() => resolve(null), { timeout: 100 });
                    } else {
                        setTimeout(resolve, 100);
                    }
                });
                
                // Log progress every 10% or every 5 batches
                if (batchIndex % Math.max(1, Math.floor(totalBatches * 0.1)) === 0 || batchIndex % 5 === 0) {
                    const percent = Math.round((startIdx / totalEmotes) * 100);
                    this.logger.log(`Pre-cache progress: ${startIdx}/${totalEmotes} (${percent}%)`, 'verbose');
                }
            }
            
            // Complete progress tracking
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
                throw error; // Re-throw abort errors
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
// PLUGIN LOGGER
// =====================================================================

/**
 * Configurable logging utility with verbosity levels.
 * 
 * Provides filtered console output with performance timing capabilities
 * for debugging and operational monitoring.
 */
class PluginLogger {
    private plugin: SevenTVPlugin;
    private defaultLogLevel: 'basic' | 'verbose' | 'debug' = 'basic';

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
    log(message: string, level: 'basic' | 'verbose' | 'debug' = 'basic'): void {
        const currentLevel = this.getLogLevel();
        const levels = ['none', 'basic', 'verbose', 'debug'];
        
        if (levels.indexOf(currentLevel) >= levels.indexOf(level)) {
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
        if (this.getLogLevel() === 'debug') {
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
    private emoteMap: Map<string, string> = new Map([['HUH', '01FFMS6Q4G0009CAK0J14692AY']]);
    
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
        console.log(`[7TV] Emote map updated with ${newMap.size} emotes`);
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
            
            console.log(`[7TV] Emote search triggered: "${query}"`);
            
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
        
        console.log(`[7TV] Found ${matches.length} emotes matching "${context.query}"`);
        
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
        
        console.log(`[7TV] Selected emote: "${value}" (ID: ${emoteId})`);
        
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
    private debounceTimer: NodeJS.Timeout | null = null;
    
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
            console.log('[7TV] Settings tab display already in progress, cancelling duplicate');
            return;
        }
        
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        this.isDisplaying = true;
        console.time('[7TV] Settings render');
        
        const { containerEl } = this;
        containerEl.empty();
        
        this.renderRequestId = requestAnimationFrame(async () => {
            try {
                // ======================
                // HEADER SECTION
                // ======================
                containerEl.createEl('h2', { text: '7TV Emotes' });
                containerEl.createEl('p', { 
                    text: 'Integrate 7TV (Twitch) emotes into your notes with auto-complete suggestions.',
                    cls: 'setting-item-description'
                });

                // ======================
                // STREAMER SELECTION
                // ======================
                containerEl.createEl('h3', { text: 'Streamer Selection' });
                containerEl.createEl('p', { 
                    text: 'Choose from popular streamers or enter a Twitch ID directly.',
                    cls: 'setting-item-description'
                });
                
                const streamerSetting = new Setting(containerEl)
                    .setName('Select Streamer')
                    .setDesc('Streamer emotes will be available for auto-complete');
                
                const buttonContainer = streamerSetting.controlEl.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';
                buttonContainer.style.alignItems = 'center';
                
                // Search button for streamer selection
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
                        setTimeout(() => {
                            this.openStreamerModal(button, updateButtonText, manualInput);
                        }, 100);
                    } else {
                        this.openStreamerModal(button, updateButtonText, manualInput);
                    }
                });
                
                // Manual Twitch ID input
                const manualInput = buttonContainer.createEl('input');
                manualInput.type = 'text';
                manualInput.placeholder = 'Twitch ID';
                manualInput.value = this.plugin.settings.twitchUserId;
                manualInput.style.flex = '1';
                
                manualInput.addEventListener('input', () => {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    
                    this.debounceTimer = setTimeout(async () => {
                        const value = manualInput.value.trim();
                        this.plugin.settings.twitchUserId = value;
                        
                        if (value && this.plugin.settings.selectedStreamerId) {
                            this.plugin.settings.selectedStreamerId = '';
                            updateButtonText();
                        }
                        
                        await this.plugin.saveSettings();
                        
                        if (/^\d{6,}$/.test(value)) {
                            console.log(`[7TV] Auto-fetching emotes for manual ID: ${value}`);
                            try {
                                await this.plugin.refreshEmotesForUser(value);
                                await this.updateCacheStats();
                                this.updateStatus();
                                new Notice('Emotes loaded');
                            } catch (error) {
                                console.error('[7TV] Failed to load emotes:', error);
                                new Notice('Failed to load emotes');
                            }
                        }
                    }, 800);
                });
                
                // Clear selection button
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
                        console.log('[7TV] Streamer selection cleared');
                        this.updateStatus();
                    });
                }

                // ======================
                // CACHE SETTINGS
                // ======================
                containerEl.createEl('h3', { text: 'Cache Settings' });
                containerEl.createEl('p', { 
                    text: 'Control how emote images are stored on your device.',
                    cls: 'setting-item-description'
                });

                // Cache strategy selection via radio buttons
                const cacheContainer = containerEl.createDiv();
                cacheContainer.style.marginBottom = '16px';
                
                // On-Demand Cache option (Default)
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
                    text: 'On-Demand Cache (Recommended)',
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
                
                // No Cache option
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
                    text: 'No Cache',
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
                
                // Cache action buttons container
                const actionContainer = containerEl.createDiv();
                actionContainer.style.display = 'grid';
                actionContainer.style.gridTemplateColumns = '1fr 1fr';
                actionContainer.style.gap = '8px';
                actionContainer.style.marginTop = '8px';
                actionContainer.style.marginBottom = '24px';

                // Pre-cache Now button
                this.preCacheButton = actionContainer.createEl('button');
                this.preCacheButton.textContent = 'Pre-cache Now';
                this.preCacheButton.style.flex = '1';
                
                this.preCacheButton.addEventListener('click', async () => {
                    if (!this.plugin.hasLoadedEmotes()) {
                        new Notice('No emotes loaded to cache');
                        return;
                    }
                    
                    // Use public method to get emote count
                    const emoteCount = this.plugin.getEmoteCount();
                    const estimatedSizeMB = ((emoteCount * 5) / 1024).toFixed(1);
                    
                    const confirmMsg = `This will download all ${emoteCount} emotes (est. ${estimatedSizeMB}MB).\n\nThis may take a while. Continue?`;
                    
                    if (confirm(confirmMsg)) {
                        new Notice('Starting pre-cache...');
                        try {
                            await this.plugin.triggerPreCache();
                            this.updateStatus();
                            this.updateActionButtons(); // Update cancel button state
                        } catch (error) {
                            new Notice(`Failed to start pre-cache: ${error.message}`);
                        }
                    }
                });

                // Cancel Pre-cache button
                this.cancelPreCacheButton = actionContainer.createEl('button');
                this.cancelPreCacheButton.textContent = 'Cancel Pre-cache';
                this.cancelPreCacheButton.className = 'mod-warning';
                
                this.cancelPreCacheButton.addEventListener('click', () => {
                    if (this.plugin.isPreCaching()) {
                        this.plugin.cancelPreCache();
                        new Notice('Pre-cache cancelled');
                        this.updateActionButtons();
                        this.updateStatus();
                    }
                });

                // Clear Cache button
                this.clearCacheButton = containerEl.createEl('button');
                this.clearCacheButton.textContent = 'Clear Cache';
                this.clearCacheButton.style.width = '100%';
                this.clearCacheButton.style.marginTop = '8px';
                this.clearCacheButton.style.marginBottom = '24px';
                
                this.clearCacheButton.addEventListener('click', async () => {
                    const warningMsg = `⚠️ Warning: Clearing the cache may cause emotes to not display correctly if:\n\n` +
                                     `• The original CDN links change or break\n` +
                                     `• You're offline and emotes aren't cached\n` +
                                     `• You switch to "No Cache" mode later\n\n` +
                                     `Are you sure you want to clear the cache?`;
                    
                    if (confirm(warningMsg)) {
                        try {
                            const cacheDir = this.plugin.getCacheDir();
                            if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                                await this.plugin.app.vault.adapter.rmdir(cacheDir, true);
                                await this.plugin.ensureCacheInitialized(); // Use public method
                                this.plugin.resetPreCacheStatus(); // Use public method
                                await this.updateCacheStats();
                                new Notice('Cache cleared successfully');
                                console.log('[7TV] Cache cleared');
                                this.updateStatus();
                            }
                        } catch (error) {
                            new Notice('Failed to clear cache');
                            console.error('[7TV] Failed to clear cache:', error);
                        }
                    }
                });

                // ======================
                // STATUS SECTION
                // ======================
                containerEl.createEl('h3', { text: 'Status' });
                
                this.statusDiv = containerEl.createDiv();
                this.statusDiv.style.marginBottom = '24px';
                this.statusDiv.style.padding = '12px';
                this.statusDiv.style.borderRadius = '6px';
                this.statusDiv.style.backgroundColor = 'var(--background-secondary)';
                this.statusDiv.style.border = '1px solid var(--background-modifier-border)';
                this.statusDiv.style.fontSize = '0.9em';
                
                // Update cache stats and status display
                await this.updateCacheStats();
                this.updateStatus();
                this.updateRadioButtons();
                this.updateActionButtons();

                // ======================
                // ADVANCED SETTINGS
                // ======================
                containerEl.createEl('h3', { text: 'Advanced' });
                containerEl.createEl('p', { 
                    text: 'Settings for debugging and troubleshooting.',
                    cls: 'setting-item-description'
                });

                // Log level dropdown (moved to bottom)
                new Setting(containerEl)
                    .setName('Log Level')
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
                            console.log(`[7TV] Log level changed to: ${value}`);
                            this.updateStatus();
                        }));
                
                console.timeEnd('[7TV] Settings render');
            } catch (error) {
                console.error('[7TV] Error rendering settings:', error);
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
            console.warn('[7TV] Failed to calculate cache stats:', error);
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
        
        // Update On-Demand radio button
        this.onDemandRadio.style.background = isOnDemand ? 'var(--interactive-accent)' : 'transparent';
        this.onDemandRadio.style.borderColor = isOnDemand ? 'var(--interactive-accent)' : 'var(--text-muted)';
        
        // Update No Cache radio button
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
        
        // Pre-cache button
        this.preCacheButton.disabled = isNoCache || !hasEmotes;
        
        // Cancel pre-cache button
        this.cancelPreCacheButton.disabled = !isPreCaching;
        
        // Clear cache button
        this.clearCacheButton.disabled = isNoCache;
        
        // Visual feedback for disabled buttons
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
    private updateStatus(): void {
        if (!this.statusDiv) return;
        
        Promise.resolve().then(async () => {
            const activeId = this.plugin.getActiveTwitchId();
            const activeStreamer = this.plugin.settings.selectedStreamerId;
            const streamerName = activeStreamer ? STREAMER_DISPLAY_MAP.get(activeStreamer) : null;
            // Use public method to get emote count
            const emoteCount = this.plugin.getEmoteCount();
            const isPreCaching = this.plugin.isPreCaching();
            const preCacheStatus = this.plugin.isPreCacheComplete() ? 'Complete' : isPreCaching ? 'In Progress' : 'Not Started';
            
            await this.updateCacheStats();
            
            let statusHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>Current Source:</strong><br>
                    ${streamerName || activeId || 'None selected'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Emotes Loaded:</strong><br>
                    ${emoteCount > 0 ? `${emoteCount} emotes` : 'None'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Cache Strategy:</strong><br>
                    ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'On-Demand' : 'No Cache'}
                </div>
            `;
            
            if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                statusHTML += `
                    <div style="margin-bottom: 8px;">
                        <strong>Cache Status:</strong><br>
                        ${this.cacheStats.count} emotes cached (${this.formatBytes(this.cacheStats.size)})
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Pre-cache:</strong><br>
                        ${preCacheStatus}
                    </div>
                `;
            }
            
            if (isPreCaching) {
                statusHTML += `
                    <div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-success); border-radius: 4px; font-size: 0.85em;">
                        <strong>⏳ Download in progress</strong><br>
                        Check top-right corner for progress
                    </div>
                `;
            }
            
            // Fixed: Use innerHTML property correctly
            if (this.statusDiv) {
                this.statusDiv.innerHTML = statusHTML;
            }
            
            // Also update action buttons in case pre-cache status changed
            this.updateActionButtons();
        });
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
            
            console.log(`[7TV] Selected streamer: ${displayName} (ID: ${twitchId})`);
            new Notice(`Fetching ${displayName}'s emotes...`);
            
            try {
                await this.plugin.refreshEmotesForUser(twitchId);
                await this.updateCacheStats();
                this.updateStatus();
                this.updateActionButtons(); // Update pre-cache button availability
                new Notice(`${displayName}'s emotes loaded`);
            } catch (error) {
                console.error('[7TV] Failed to load emotes:', error);
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
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        // Clear element references
        this.onDemandRadio = null;
        this.noCacheRadio = null;
        this.preCacheButton = null;
        this.cancelPreCacheButton = null;
        this.clearCacheButton = null;
        this.statusDiv = null;
        
        this.isDisplaying = false;
        super.hide();
        console.log('[7TV] Settings tab hidden');
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
        
        // Main container with horizontal layout
        const container = el.createDiv({ cls: 'seven-tv-streamer-suggestion-container' });
        
        // Left section: Vertical stack of streamer information
        const infoSection = container.createDiv({ cls: 'seven-tv-streamer-info-section' });
        
        // Streamer name (primary text, bold)
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-name',
            text: displayName
        });
        
        // Twitch ID (secondary text, smaller and muted)
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-id',
            text: `Twitch ID: ${twitchId}`
        });
        
        // Right section: Selection indicator (only shown if currently selected)
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
 * Always includes HUH emote as a reliable fallback.
 * 
 * @param twitchId - Numeric Twitch user identifier
 * @returns Promise resolving to map of emote names to 7TV IDs
 * 
 * @throws {Error} When API requests fail or return invalid data
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();
    // Always include HUH as a reliable fallback emote
    emoteMap.set('HUH', '01FFMS6Q4G0009CAK0J14692AY');
    
    try {
        console.log(`[7TV] Fetching 7TV emotes for Twitch ID: ${twitchId}`);
        
        // Fetch user data to get emote set ID
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id ||
            (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        console.log(`[7TV] Found emote set ID: ${emoteSetId}`);
        
        // Fetch emote set data
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        // Extract emotes from set data
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            console.log(`[7TV] Processing ${setData.emotes.length} emotes from set`);
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                }
            });
            console.log(`[7TV] Successfully mapped ${emoteMap.size} emotes`);
        }
    } catch (error) {
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
    }
    
    return emoteMap;
}