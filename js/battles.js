/* 战役复盘 + 政治博弈（数据 + 视图）
 * 战役数据：时间、地点、双方将领/兵力（约数）、路线箭头、结果、出处。
 * 兵力多为史籍“号称/约数”，一律标“约”，仅作复盘示意。
 */
(function () {
  'use strict';

  const BATTLES = [
    {
      id: 'qingkou', name: '清口之战', year: 897, month: '十一月', place: [118.9, 33.3],
      sides: [
        { label: '吴', regime: 'wu', commanders: ['杨行密', '朱瑾', '张训'], troops: '约 3 万' },
        { label: '汴（后梁前身）', regime: 'houliang', commanders: ['庞师古', '葛从周'], troops: '约 10 万' }
      ],
      result: '吴军决淮水灌汴军，庞师古战死，汴军大败，淮南之势遂固。',
      arrows: [
        { from: [117.9, 33.0], to: [119.0, 33.4], kind: 'attack', label: '汴军自宿州南下' },
        { from: [119.4, 32.5], to: [118.9, 33.2], kind: 'attack', label: '吴军自扬州北上' }
      ],
      note: '朱温南征受挫，吴与吴越、楚鼎立之势成形。',
      src: '《资治通鉴》卷二百六十一；《新五代史·杨行密传》'
    },
    {
      id: 'boixiang', name: '柏乡之战', year: 911, month: '正月', place: [114.65, 37.52],
      sides: [
        { label: '晋', regime: 'jin', commanders: ['李存勖', '周德威', '李嗣源'], troops: '约 5 万' },
        { label: '梁', regime: 'houliang', commanders: ['王景仁', '韩勍'], troops: '约 8 万' }
      ],
      result: '晋军诱梁军出营野战，大破之，梁军精锐损失惨重，河北尽归晋。',
      arrows: [
        { from: [114.75, 36.85], to: [114.65, 37.45], kind: 'attack', label: '梁军北上' },
        { from: [112.4, 37.9], to: [114.5, 37.55], kind: 'attack', label: '晋军东出' }
      ],
      note: '五代前期最关键的转折之一：晋由守转攻。',
      src: '《资治通鉴》卷二百六十七；《旧五代史·周德威传》',
      steps: [{"name":"开战","text":"梁将王景仁率军自邢州北上，屯于柏乡；晋军自晋阳东出，屯高邑，与梁军隔野相望。","arrows":[{"from":[114.5,37.05],"to":[114.65,37.5],"kind":"attack","label":"梁军北上"},{"from":[112.65,37.8],"to":[114.5,37.6],"kind":"attack","label":"晋军东出"}]},{"name":"诱敌","text":"周德威率轻骑挑战，梁军坚壁不出；晋军佯退，梁军以为晋军怯战。","arrows":[{"from":[114.55,37.62],"to":[114.7,37.5],"kind":"flank","label":"晋轻骑挑战"}]},{"name":"列阵","text":"梁军尽出营列阵，兵力虽众而阵形未整；晋军以逸待劳，择其弱点。","arrows":[{"from":[114.68,37.45],"to":[114.55,37.6],"kind":"attack","label":"梁军出战"}]},{"name":"决胜","text":"晋军骑兵两翼冲击，梁军大溃，河北形势自此逆转。","arrows":[{"from":[114.4,37.55],"to":[114.7,37.5],"kind":"attack","label":"晋左翼冲击"},{"from":[114.5,37.75],"to":[114.7,37.52],"kind":"attack","label":"晋右翼冲击"}]}]
    },
    {
      id: 'youzhou', name: '幽州之战', year: 917, month: '三月—八月', place: [116.3, 39.6],
      sides: [
        { label: '晋', regime: 'jin', commanders: ['李嗣源', '周德威', '李存勖'], troops: '约 7 万' },
        { label: '契丹', regime: 'liao', commanders: ['耶律阿保机'], troops: '号称 30 万' }
      ],
      result: '晋军坚守幽州、内外夹击，契丹军退走；卢龙未失。',
      arrows: [
        { from: [121.0, 43.0], to: [117.3, 40.3], kind: 'attack', label: '契丹南下' },
        { from: [115.4, 38.7], to: [116.3, 39.55], kind: 'attack', label: '晋军驰援' }
      ],
      note: '骑战与守城的经典；幽州成为晋对契丹的门户。',
      src: '《资治通鉴》卷二百六十九；《辽史·太祖本纪》'
    },
    {
      id: 'huliubei', name: '胡柳陂之战', year: 919, month: '十二月', place: [114.9, 35.2],
      sides: [
        { label: '晋', regime: 'jin', commanders: ['李存勖', '周德威', '李嗣源'], troops: '约 5 万' },
        { label: '梁', regime: 'houliang', commanders: ['贺瑰', '王彦章'], troops: '约 6 万' }
      ],
      result: '晋军先败后胜，周德威战死；双方俱伤，梁未能扭转颓势。',
      arrows: [
        { from: [114.2, 34.6], to: [115.0, 35.1], kind: 'attack', label: '梁军北上' },
        { from: [115.2, 34.4], to: [114.9, 35.2], kind: 'attack', label: '晋军迎击' }
      ],
      note: '晋虽胜而失良将；梁军自此更倚王彦章。',
      src: '《资治通鉴》卷二百七十；《旧五代史·周德威传》'
    },
    {
      id: 'shengde', name: '德胜—杨刘之战', year: 923, month: '四月—六月', place: [115.9, 36.3],
      sides: [
        { label: '后唐', regime: 'houtang', commanders: ['李存勖', '郭崇韬', '李嗣源'], troops: '约 5 万' },
        { label: '后梁', regime: 'houliang', commanders: ['王彦章', '段凝'], troops: '约 6 万' }
      ],
      result: '唐军先失德胜、退守杨刘，再渡河反击，梁军攻势顿挫，汴梁空虚。',
      arrows: [
        { from: [115.0, 35.1], to: [115.9, 36.3], kind: 'attack', label: '梁军北上' },
        { from: [114.0, 36.4], to: [115.9, 36.3], kind: 'attack', label: '唐军东援' }
      ],
      note: '夹河苦战：王彦章两破唐军，但梁廷掣肘，终致后方空虚。',
      src: '《资治通鉴》卷二百七十二；《旧五代史·王彦章传》'
    },
    {
      id: 'xibian', name: '唐军袭汴', year: 923, month: '十月', place: [114.35, 34.8],
      sides: [
        { label: '后唐', regime: 'houtang', commanders: ['李嗣源', '李存勖'], troops: '前锋数千骑' },
        { label: '后梁', regime: 'houliang', commanders: ['朱友贞（末帝）'], troops: '汴梁守军约 1 万' }
      ],
      result: '唐军轻骑直捣汴梁，末帝自杀，后梁亡。',
      arrows: [
        { from: [115.5, 36.2], to: [114.4, 34.9], kind: 'attack', label: '李嗣源轻骑南下' }
      ],
      note: '七天破国：正面相持、侧翼直取都城的经典。',
      src: '《资治通鉴》卷二百七十二；《旧五代史·唐庄宗纪》',
      steps: [{"name":"相持","text":"唐梁夹河相持，梁军主力尽在前线，汴梁空虚。","arrows":[{"from":[115.9,36.3],"to":[115.95,36.25],"kind":"flank","label":"夹河对峙"}]},{"name":"轻骑","text":"李嗣源率前锋轻骑自郓州西进，绕过梁军主力，直趋汴梁。","arrows":[{"from":[116,35.7],"to":[114.4,34.9],"kind":"attack","label":"李嗣源轻骑南下"}]},{"name":"城降","text":"汴梁无备，末帝朱友贞自杀，后梁灭亡；唐军七日破国。","arrows":[{"from":[114.5,34.95],"to":[114.35,34.82],"kind":"attack","label":"唐军入汴"}]}]
    },
    {
      id: 'qianshu', name: '灭前蜀之战', year: 925, month: '九月—十一月', place: [104.8, 32.0],
      sides: [
        { label: '后唐', regime: 'houtang', commanders: ['郭崇韬', '李继岌', '康延孝'], troops: '约 6 万' },
        { label: '前蜀', regime: 'qianshu', commanders: ['王衍', '王宗弼'], troops: '约 10 万' }
      ],
      result: '唐军走斜谷、出剑门，七十日灭前蜀，王衍出降。',
      arrows: [
        { from: [108.9, 34.2], to: [105.8, 32.8], kind: 'attack', label: '唐军自关中入蜀' },
        { from: [105.0, 33.4], to: [104.1, 30.7], kind: 'attack', label: '入成都' }
      ],
      note: '后唐极盛；灭蜀之功也埋下郭崇韬之死。',
      src: '《资治通鉴》卷二百七十三；《旧五代史·郭崇韬传》'
    },
    {
      id: 'jinyang', name: '晋阳之战', year: 936, month: '七月—九月', place: [112.55, 37.87],
      sides: [
        { label: '后唐', regime: 'houtang', commanders: ['张敬达', '杨光远'], troops: '约 5 万' },
        { label: '后晋 + 契丹', regime: 'houjin', commanders: ['石敬瑭', '耶律德光'], troops: '约 5 万 + 契丹骑' }
      ],
      result: '契丹援军南下，唐军大败，石敬瑭称帝、割燕云十六州。',
      arrows: [
        { from: [113.0, 40.1], to: [112.6, 38.0], kind: 'attack', label: '契丹南下' },
        { from: [111.6, 38.2], to: [112.5, 37.9], kind: 'attack', label: '唐军围太原' }
      ],
      note: '燕云割让改变此后四百年华北格局。',
      src: '《资治通鉴》卷二百八十；《辽史·太宗本纪》'
    },
    {
      id: 'yangcheng', name: '阳城之战', year: 945, month: '三月', place: [115.1, 38.1],
      sides: [
        { label: '后晋', regime: 'houjin', commanders: ['杜重威', '李守贞', '符彦卿'], troops: '约 10 万' },
        { label: '辽', regime: 'liao', commanders: ['耶律德光'], troops: '号称 30 万' }
      ],
      result: '晋军逆风反击，辽军大败北撤；但主帅杜重威心怀异志。',
      arrows: [
        { from: [117.0, 39.4], to: [115.2, 38.2], kind: 'attack', label: '辽军南下' },
        { from: [114.6, 37.6], to: [115.2, 38.1], kind: 'attack', label: '晋军北击' }
      ],
      note: '后晋对辽少有的野战大胜，却未能改变次年亡国。',
      src: '《资治通鉴》卷二百八十四；《旧五代史·符彦卿传》'
    },
    {
      id: 'hezhong', name: '河中之战', year: 950, month: '四月—七月', place: [110.4, 35.0],
      sides: [
        { label: '后汉 / 后周', regime: 'houhan', commanders: ['郭威', '王峻'], troops: '约 5 万' },
        { label: '三镇联军', regime: 'houhan', commanders: ['李守贞', '赵思绾', '王景崇'], troops: '约 4 万' }
      ],
      result: '郭威围河中、断粮道，李守贞自焚，三镇平；郭威声望大增。',
      arrows: [
        { from: [112.5, 34.8], to: [110.5, 35.0], kind: 'attack', label: '郭威西征' },
        { from: [109.3, 36.0], to: [110.4, 35.0], kind: 'flank', label: '分兵断援' }
      ],
      note: '郭威由此掌兵权，为后周代汉埋下伏笔。',
      src: '《资治通鉴》卷二百八十九；《旧五代史·周太祖纪》'
    },
    {
      id: 'gaoping', name: '高平之战', year: 954, month: '三月', place: [112.9, 35.8],
      sides: [
        { label: '后周', regime: 'houzhou', commanders: ['柴荣', '赵匡胤', '张永德'], troops: '约 2 万' },
        { label: '北汉 + 辽', regime: 'beiHan', commanders: ['刘崇', '耶律敌禄'], troops: '约 3 万 + 辽骑 1 万' }
      ],
      result: '周军初战不利，柴荣亲冒矢石，赵匡胤等力战，北汉大败，刘崇仅以身免。',
      arrows: [
        { from: [112.6, 37.6], to: [112.9, 35.9], kind: 'attack', label: '北汉辽军南下' },
        { from: [113.2, 34.8], to: [112.9, 35.8], kind: 'attack', label: '周军北上迎击' }
      ],
      note: '高平之战确立柴荣威望，开启后周改革与统一战争。',
      src: '《资治通鉴》卷二百九十一；《旧五代史·周世宗纪》',
      steps: [{"name":"南下","text":"北汉主刘崇联合辽军自太原南下，直趋高平；后周世宗柴荣决意亲征。","arrows":[{"from":[112.6,37.6],"to":[112.9,35.95],"kind":"attack","label":"北汉辽军南下"},{"from":[114.3,35],"to":[113.2,35.7],"kind":"attack","label":"周军北上"}]},{"name":"初战","text":"两军列阵，周右军先溃，阵脚动摇，诸将失色。","arrows":[{"from":[113.1,35.9],"to":[112.95,35.85],"kind":"attack","label":"北汉冲周右军"}]},{"name":"亲征","text":"柴荣亲冒矢石督战，赵匡胤、张永德各率精骑冲阵，周军士气复振。","arrows":[{"from":[113.15,35.72],"to":[112.9,35.85],"kind":"attack","label":"赵匡胤冲阵"},{"from":[112.8,35.9],"to":[112.95,35.82],"kind":"flank","label":"张永德夹击"}]},{"name":"决胜","text":"北汉军大败，刘崇仅以身免；周军乘胜进围太原。","arrows":[{"from":[112.95,35.85],"to":[112.7,36.2],"kind":"attack","label":"周军追击"}]}]
    },
    {
      id: 'zijinshan', name: '紫金山之战', year: 956, month: '三月', place: [117.2, 32.6],
      sides: [
        { label: '后周', regime: 'houzhou', commanders: ['柴荣', '赵匡胤', '李重进'], troops: '约 5 万' },
        { label: '南唐', regime: 'nantang', commanders: ['李景达', '边镐', '许文稹'], troops: '约 5 万' }
      ],
      result: '周军破唐军援兵大营，斩首数万，寿州孤悬，南唐被迫议和。',
      arrows: [
        { from: [118.7, 32.0], to: [117.2, 32.5], kind: 'attack', label: '唐军自金陵来援' },
        { from: [116.8, 32.9], to: [117.2, 32.6], kind: 'attack', label: '周军邀击' }
      ],
      note: '淮南三征的转折：南唐失去野战能力。',
      src: '《资治通鉴》卷二百九十三；《旧五代史·周世宗纪》',
      steps: [{"name":"来援","text":"南唐李景达率援军自金陵渡江，列营紫金山，欲解寿州之围。","arrows":[{"from":[118.6,32.15],"to":[117.35,32.55],"kind":"attack","label":"唐军渡江来援"}]},{"name":"断粮","text":"周军分兵断唐军粮道，据险夹击，唐军首尾不能相顾。","arrows":[{"from":[116.7,32.9],"to":[117.3,32.65],"kind":"flank","label":"周军断粮道"}]},{"name":"溃败","text":"唐军大溃，斩首数万，寿州孤悬，南唐被迫割地求和。","arrows":[{"from":[117.25,32.6],"to":[117.9,32.35],"kind":"attack","label":"唐军溃退"}]}]
    },
    {
      id: 'shu965', name: '宋灭后蜀', year: 965, month: '正月—二月', place: [105.0, 32.0],
      sides: [
        { label: '宋', regime: 'song', commanders: ['王全斌', '崔彦进', '刘光义'], troops: '约 6 万' },
        { label: '后蜀', regime: 'houshu', commanders: ['孟昶', '王昭远', '赵崇韬'], troops: '约 10 万' }
      ],
      result: '宋军分路入蜀，剑门破、成都降，后蜀亡，仅六十六日。',
      arrows: [
        { from: [108.5, 34.0], to: [105.8, 32.8], kind: 'attack', label: '王全斌出凤州' },
        { from: [110.5, 30.8], to: [105.5, 30.9], kind: 'attack', label: '刘光义出归州' }
      ],
      note: '宋统一战争第一役；蜀地财赋随后成为灭南方的本钱。',
      src: '《宋史·王全斌传》；《续资治通鉴长编》卷五'
    },
    {
      id: 'jinling', name: '宋灭南唐（金陵之战）', year: 975, month: '正月—十一月', place: [118.78, 32.06],
      sides: [
        { label: '宋', regime: 'song', commanders: ['曹彬', '潘美', '曹翰'], troops: '约 10 万' },
        { label: '南唐', regime: 'nantang', commanders: ['李煜', '朱令赟', '皇甫继勋'], troops: '约 10 万' }
      ],
      result: '宋军渡江围金陵近一年，朱令赟援军覆于皖口，城破，李煜降，南唐亡。',
      arrows: [
        { from: [117.0, 32.1], to: [118.7, 32.1], kind: 'attack', label: '宋军自采石渡江' },
        { from: [116.0, 29.6], to: [117.6, 31.0], kind: 'flank', label: '皖口援军被截' }
      ],
      note: '“卧榻之侧，岂容他人鼾睡”；南唐文治至此终结。',
      src: '《宋史·曹彬传》《宋史·李煜传》；《续资治通鉴长编》卷十六',
      steps: [{"name":"渡江","text":"宋军自采石架浮桥渡江，连破唐军水寨，进围金陵。","arrows":[{"from":[118.4,31.6],"to":[118.75,32],"kind":"attack","label":"宋军渡江"}]},{"name":"围城","text":"曹彬、潘美分营围城，久围不攻，唐军困守。","arrows":[{"from":[118.95,32.2],"to":[118.8,32.1],"kind":"flank","label":"宋军合围"}]},{"name":"援绝","text":"朱令赟率江西唐军来援，于皖口被宋军截击，全军覆没。","arrows":[{"from":[117.25,30.55],"to":[117.6,31],"kind":"attack","label":"唐援军北上"},{"from":[117,31.1],"to":[117.55,31],"kind":"flank","label":"宋军截击"}]},{"name":"城破","text":"金陵城破，李煜出降，南唐灭亡。","arrows":[{"from":[118.85,32.15],"to":[118.78,32.06],"kind":"attack","label":"宋军入城"}]}]
    },
    {
      id: 'baima', name: '白马岭之战', year: 979, month: '三月', place: [113.6, 38.2],
      sides: [
        { label: '宋', regime: 'song', commanders: ['郭进'], troops: '约 1 万' },
        { label: '辽', regime: 'liao', commanders: ['耶律沙', '耶律斜轸'], troops: '约 3 万' }
      ],
      result: '宋军半渡击辽，辽军大败，救援北汉的辽军退回；宋遂破太原。',
      arrows: [
        { from: [113.9, 39.6], to: [113.6, 38.3], kind: 'attack', label: '辽军南下援汉' },
        { from: [113.2, 37.7], to: [113.6, 38.2], kind: 'attack', label: '宋军据险邀击' }
      ],
      note: '五代十国落幕之战的前奏。',
      src: '《宋史·郭进传》；《辽史·耶律沙传》',
      steps: [{"name":"南下","text":"辽将耶律沙率军南下，欲援北汉，渡白马岭一线。","arrows":[{"from":[113.9,39.4],"to":[113.65,38.35],"kind":"attack","label":"辽军南下"}]},{"name":"半渡","text":"宋将郭进据险邀击，乘辽军半渡而击之，辽军大乱。","arrows":[{"from":[113.35,37.95],"to":[113.65,38.2],"kind":"attack","label":"宋军邀击"}]},{"name":"溃退","text":"辽军败退，北汉援绝，宋军遂克太原。","arrows":[{"from":[113.6,38.25],"to":[113.9,38.7],"kind":"retreat","label":"辽军北退"}]}]
    },
    {
      id: 'taiyuan', name: '太原之战', year: 979, month: '正月—五月', place: [112.55, 37.87],
      sides: [
        { label: '宋', regime: 'song', commanders: ['赵光义', '潘美', '曹翰'], troops: '约 10 万' },
        { label: '北汉', regime: 'beiHan', commanders: ['刘继元'], troops: '约 3 万' }
      ],
      result: '宋军久围太原，辽援已破，北汉主出降，五代十国时代结束。',
      arrows: [
        { from: [114.5, 36.9], to: [112.7, 37.8], kind: 'attack', label: '宋军合围' },
        { from: [112.9, 36.9], to: [112.6, 37.8], kind: 'attack', label: '切断汾河粮道' }
      ],
      note: '979 年，最后一个割据政权归入宋朝。',
      src: '《宋史·太宗本纪》；《续资治通鉴长编》卷二十'
    }
  ];

  const POLITICS = [
    { year: 907, title: '朱温代唐：禅让还是维持唐室', scene: '唐廷已空，藩镇或附或叛；朱温据中原、挟天子。',
      options: ['受禅称帝，建后梁', '继续挟唐以令藩镇'], outcome: '朱温受禅，后梁建立；河东李克用、淮南杨渥、西川王建不奉梁正朔，天下正式分裂。',
      impact: '五代十国开局：正统转移，藩镇各自称帝称王。' },
    { year: 923, title: '李存勖称帝：先正名还是先灭梁', scene: '晋军已据河北，梁廷内乱；诸将劝进。',
      options: ['先称帝以正名分', '继续以晋王号讨梁'], outcome: '李存勖于魏州称帝，国号大唐；同年灭梁，后唐成为中原正统。',
      impact: '“复唐”旗号凝聚人心，也带来后唐的合法性包袱。' },
    { year: 936, title: '石敬瑭的赌局：割燕云借契丹', scene: '后唐围太原，石敬瑭兵少粮尽；契丹方强。',
      options: ['割燕云十六州、称儿皇帝借兵', '死守太原待变'], outcome: '石敬瑭割燕云十六州、称臣于辽，契丹南下破唐，后晋建立。',
      impact: '华北门户尽失，此后四百年中原对辽处于守势。' },
    { year: 947, title: '后晋末局：降辽还是死战', scene: '辽军三度南下，晋军主力在滹沱河投降，汴梁空虚。',
      options: ['出降以保宗族', '固守待援'], outcome: '出帝被俘，后晋亡；辽太宗入汴称帝，旋因中原反抗北归。',
      impact: '“开运之耻”成为五代最惨痛的政治教训。' },
    { year: 951, title: '郭威兵变：黄旗加身还是拥立刘氏', scene: '隐帝杀三臣、诛郭威家属；郭威引兵南下，士卒哗变。',
      options: ['顺势称帝，建后周', '另立刘氏宗室以安人心'], outcome: '郭威称帝，后周建立；刘崇在太原建北汉，中原与河东再度分裂。',
      impact: '后周改革由此开始，为宋统一奠定制度基础。' },
    { year: 954, title: '高平之后：亲征立威还是守成', scene: '北汉联合辽军南下，新君柴荣初立，朝臣多主守。',
      options: ['御驾亲征，决战高平', '固守汴梁，待敌自退'], outcome: '柴荣亲征大胜，威望确立；随后整军、废佛、治河、三征淮南。',
      impact: '后周由“五代之一”转为“统一战争的主角”。' },
    { year: 960, title: '陈桥兵变：黄袍加身还是忠于后周', scene: '世宗新丧，幼主临朝；禁军北上御辽，行至陈桥。',
      options: ['受拥立，代周建宋', '还军护周，讨平叛乱'], outcome: '赵匡胤黄袍加身，建立宋朝；后周宗室被优容，统一战争继续。',
      impact: '五代循环的终点：兵变建国，却以文治收束武人政治。' },
    { year: 978, title: '吴越纳土：归宋还是守境', scene: '宋已平南唐、南汉，吴越三面受敌；钱俶入朝。',
      options: ['纳土归宋，保族全身', '据境自守，待时局变化'], outcome: '钱俶献十三州归宋，吴越亡；江南免于兵燹。',
      impact: '“纳土”成为十国中最体面的收场。' }
  ];

  const W = 840, H = 1000;
  const B = (window.GEO || {}).bounds || { lon0: 100, lon1: 126, lat0: 17, lat1: 43 };
  const proj = (lon, lat) => [
    ((lon - B.lon0) / (B.lon1 - B.lon0)) * W,
    ((B.lat1 - lat) / (B.lat1 - B.lat0)) * H
  ];

  let current = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function battleById(id) { return BATTLES.find(b => b.id === id); }

  let stepIdx = 0, stepTimer = null;

  function stepsOf(battle) {
    return (battle.steps && battle.steps.length) ? battle.steps
      : [{ name: '战况', text: battle.result, arrows: battle.arrows || [] }];
  }

  function parseTroops(s) {
    const wan = /(\d+(?:\.\d+)?)\s*万/.exec(s);
    if (wan) return parseFloat(wan[1]) * 10000;
    const qian = /(\d+)\s*千/.exec(s);
    if (qian) return parseInt(qian[1], 10) * 1000;
    return null;
  }

  function renderTroopBars(battle) {
    const nums = battle.sides.map(s => parseTroops(s.troops));
    const max = Math.max.apply(null, nums.filter(n => n)) || 1;
    return battle.sides.map((s, i) => {
      const n = nums[i];
      const w = n ? Math.max(6, n / max * 100) : 8;
      const col = ((window.ATLAS && window.ATLAS.regimes) || []).find(r => r.id === s.regime);
      const color = col ? col.color : '#a8823c';
      return `<div class="bt-bar-row">
        <span class="bt-bar-name">${esc(s.label)}</span>
        <span class="bt-bar-track"><i style="width:${w.toFixed(0)}%;background:${color}"></i></span>
        <span class="bt-bar-num">${esc(s.troops)}</span>
      </div>`;
    }).join('');
  }

  function stopAuto() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } const btn = document.querySelector('.bt-auto'); if (btn) btn.textContent = '▶ 自动推演'; }

  function renderStep(battle, idx) {
    stepIdx = idx;
    const steps = stepsOf(battle);
    const step = steps[Math.min(idx, steps.length - 1)];
    const panel = document.getElementById('battle-panel');
    if (!panel) return;
    const head = panel.querySelector('.bt-step-head');
    if (head) head.innerHTML = `<span class="bt-step-idx">第 ${idx + 1} / ${steps.length} 步</span><b>${esc(step.name)}</b>`;
    const txt = panel.querySelector('.bt-step-text');
    if (txt) txt.textContent = step.text;
    const pips = panel.querySelector('.bt-pips');
    if (pips) pips.innerHTML = steps.map((s, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}" title="${esc(s.name)}"></i>`).join('');
    panel.querySelectorAll('.bt-step-btn').forEach(btn => {
      const d = +btn.getAttribute('data-step');
      btn.disabled = (idx + d < 0 || idx + d > steps.length - 1);
    });
    if (window.AtlasMap) window.AtlasMap.setBattle(battle.id, idx);
  }

  function openBattle(id, startStep) {
    const battle = battleById(id);
    if (!battle) return;
    current = id;
    stopAuto();
    const panel = document.getElementById('battle-panel');
    if (!panel) return;
    const steps = stepsOf(battle);
    const idx0 = Math.max(0, Math.min(steps.length - 1, startStep || 0));
    const sideHtml = battle.sides.map(s => `
      <div class="bt-side">
        <div class="bt-side-label">${esc(s.label)}</div>
        <div class="bt-commanders">${s.commanders.map(c => `<button class="ev-person" data-cmd="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="bt-troops">${esc(s.troops)}</div>
      </div>`).join('');
    panel.innerHTML = `
      <button class="bt-close" aria-label="关闭">×</button>
      <div class="bt-head"><span class="bt-year">${battle.year}${battle.month ? ' · ' + battle.month : ''}</span><h3>${esc(battle.name)}</h3></div>
      <div class="bt-troopbars">${renderTroopBars(battle)}</div>
      <div class="bt-sides">${sideHtml}</div>
      <div class="bt-step-box">
        <div class="bt-step-head"></div>
        <p class="bt-step-text"></p>
        <div class="bt-pips"></div>
        <div class="bt-step-actions">
          <button class="bt-step-btn" data-step="-1">← 上一步</button>
          <button class="bt-step-btn" data-step="1">下一步 →</button>
          <button class="bt-auto">▶ 自动推演</button>
          <button class="bt-replay">↻ 重演本步</button>
        </div>
      </div>
      <p class="bt-result">${esc(battle.result)}</p>
      <p class="bt-note">${esc(battle.note)}</p>
      <p class="bt-src">史料：${esc(battle.src)}　兵力为约数，路线为示意</p>`;
    panel.hidden = false;
    panel.querySelector('.bt-close').addEventListener('click', closeBattle);
    panel.querySelectorAll('.bt-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = +btn.getAttribute('data-step');
        renderStep(battle, Math.max(0, Math.min(steps.length - 1, stepIdx + d)));
      });
    });
    panel.querySelector('.bt-replay').addEventListener('click', () => { if (window.AtlasMap) window.AtlasMap.replayBattle(); });
    panel.querySelector('.bt-auto').addEventListener('click', (e) => {
      if (stepTimer) { stopAuto(); return; }
      e.target.textContent = '❚❚ 停止';
      stepTimer = setInterval(() => {
        if (stepIdx >= steps.length - 1) { stopAuto(); return; }
        renderStep(battle, stepIdx + 1);
      }, 2600);
    });
    panel.querySelectorAll('[data-cmd]').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-cmd');
        const pp = (window.PEOPLE || []).find(x => x.n === name);
        if (pp && window.PeopleView) window.PeopleView.focus(pp.id);
      });
    });
    renderStep(battle, idx0);
  }

  function closeBattle() {
    current = null;
    const panel = document.getElementById('battle-panel');
    if (panel) panel.hidden = true;
    if (window.AtlasMap) window.AtlasMap.setBattle(null);
  }

  /* 战役目录视图 */
  function renderList() {
    const box = document.getElementById('battle-list');
    if (!box) return;
    const byYear = BATTLES.slice().sort((a, b) => a.year - b.year);
    box.innerHTML = byYear.map(b => `
      <button class="bt-card" data-id="${b.id}">
        <span class="bt-card-year">${b.year}</span>
        <span class="bt-card-body">
          <b>${esc(b.name)}</b>
          <i>${b.sides.map(s => esc(s.label)).join(' vs ')}</i>
          <em>${esc(b.result)}</em>
        </span>
      </button>`).join('');
    box.querySelectorAll('.bt-card').forEach(el => {
      el.addEventListener('click', () => {
        const b = battleById(el.getAttribute('data-id'));
        if (window.PeopleView) window.PeopleView.setView('map');
        if (window.atlasSetYear) window.atlasSetYear(b.year);
        openBattle(b.id);
      });
    });
  }

  /* 政治博弈视图 */
  function renderPolitics() {
    const body = document.getElementById('politics-body');
    if (!body) return;
    const y = (window.atlasGetYear && window.atlasGetYear()) || 875;
    const ATLAS = window.ATLAS || {};
    // 势力指数：以疆域段面积近似（示意）
    const areas = {};
    (ATLAS.territories || []).forEach(t => {
      if (!(t.from <= y && y < t.to)) return;
      let a = 0;
      (t.polys || []).forEach(poly => {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
          const p1 = proj(poly[i][0], poly[i][1]);
          const p2 = proj(poly[(i + 1) % poly.length][0], poly[(i + 1) % poly.length][1]);
          s += p1[0] * p2[1] - p2[0] * p1[1];
        }
        a += Math.abs(s) / 2;
      });
      areas[t.regime] = (areas[t.regime] || 0) + a;
    });
    const regs = (ATLAS.regimes || []).filter(r => areas[r.id] > 0).sort((a, b) => areas[b.id] - areas[a.id]).slice(0, 8);
    const maxA = regs.length ? areas[regs[0].id] : 1;
    const bars = regs.map(r => `
      <div class="pw-row">
        <span class="pw-name">${esc(r.name)}</span>
        <span class="pw-track"><i style="width:${Math.max(4, areas[r.id] / maxA * 100).toFixed(0)}%;background:${r.color}"></i></span>
        <span class="pw-num">${(areas[r.id] / maxA * 100).toFixed(0)}</span>
      </div>`).join('');
    const cards = POLITICS.slice().sort((a, b) => a.year - b.year).map(p => `
      <button class="pw-card" data-year="${p.year}">
        <span class="pw-card-year">${p.year}</span>
        <span class="pw-card-title">${esc(p.title)}</span>
        <span class="pw-card-scene">${esc(p.scene)}</span>
        <span class="pw-card-opts">${p.options.map(o => `<i>${esc(o)}</i>`).join('')}</span>
        <span class="pw-card-out">→ ${esc(p.outcome)}</span>
        <span class="pw-card-impact">${esc(p.impact)}</span>
      </button>`).join('');
    body.innerHTML = `
      <div class="pw-head">
        <h2>势力格局 <small>${y} 年 · 按疆域面积示意</small></h2>
        <div class="pw-bars">${bars}</div>
      </div>
      <div class="pw-grid">${cards}</div>
      <p class="pw-note">势力指数由疆域多边形面积近似，仅表示相对大小；“博弈”条目为关键抉择复盘，年份可点击跳转。</p>`;
    body.querySelectorAll('[data-year]').forEach(el => {
      el.addEventListener('click', () => {
        const yy = +el.getAttribute('data-year');
        if (window.atlasSetYear) window.atlasSetYear(yy);
        if (window.PeopleView) window.PeopleView.setView('map');
      });
    });
  }

  window.BATTLES = BATTLES;
  window.POLITICS = POLITICS;
  window.BattleView = { open: openBattle, close: closeBattle, renderList };
  window.PoliticsView = { render: renderPolitics };

  function init() {
    if (document.getElementById('battle-list')) renderList();
    const pb = document.getElementById('politics-body');
    if (pb) renderPolitics();
    document.addEventListener('atlas:year', () => {
      const v = document.body.dataset.view;
      if (v === 'politics') renderPolitics();
    });
    const hash = /[#&]battle=([\w-]+)/.exec(location.hash);
    const hs = /[#&]step=(\d+)/.exec(location.hash);
    if (hash) setTimeout(() => openBattle(hash[1], hs ? +hs[1] : 0), 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
