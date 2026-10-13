export interface KeywordRule {
  re: RegExp;
  cat: string;
  sub?: string;
  merchantKey?: string;
  priority?: number;
}

export interface CategorySuggestion {
  cat: string;
  sub?: string;
  merchantKey?: string;
  confidence: number;
  matchedRule?: string;
}

const STOP_WORDS = new Set([
  'ltd','pvt','limited','india','paisa','pay','upi','cr','dr','the','and','for','at','on','in','of','to','a','an',
  'by','from','via','with','without','is','the','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','must','can','could','shall','should','would',
]);

export function normaliseDescription(raw: string): string {
  let d = raw.trim();
  d = d.replace(/[^a-zA-Z\s]/g, ' ');
  d = d.replace(/\s+/g, ' ').trim().toLowerCase();
  const words = d.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.join(' ');
}

function scoreMatch(description: string, rule: KeywordRule): number {
  const matches = description.match(rule.re);
  if (!matches || matches.length === 0) return 0;
  const matchLen = matches.reduce((s, m) => s + m.length, 0);
  const bonus = rule.priority ?? 0;
  return matchLen + bonus;
}

export const RULES: KeywordRule[] = [
  // --- Health ---
  { re: /pharmacy|medplus|apollo\s+pharm|netmeds|1mg|pharmeasy|practo|wellness|apollopharmacy/i, cat: 'Health', sub: 'Pharmacy / Medicines', merchantKey: 'pharmacy', priority: 10 },
  { re: /apollo\s+hospital|fortis|manipal|narayana|hospital|medica|clinic|fertility|max\s+hospital|kauvery|gleneagles|lifeline/i, cat: 'Health', sub: 'Hospitalization', merchantKey: 'hospital', priority: 10 },
  { re: /doctor|dr\.\s|consultation|physiotherapi|ayurved|homeopath|pathology|diagnostic|thyrocare|lalpath|srl\s+diagnostic|metropolis/i, cat: 'Health', sub: 'Doctor Consultation', priority: 5 },
  { re: /lab|test|scan|mri|ct\s+scan|x.?ray|blood\s+test/i, cat: 'Health', sub: 'Lab Tests', priority: 5 },
  { re: /dental|tooth|dentist/i, cat: 'Health', sub: 'Dental', priority: 5 },
  { re: /eye\s+care|optical|specs|vision|eye\b|spectacles/i, cat: 'Health', sub: 'Eye Care', priority: 5 },
  { re: /yoga|fitness|gym|cult\.fit|fitness\s+club|health\s+club/i, cat: 'Health', sub: 'Gym / Fitness', priority: 5 },
  { re: /health\s+insurance|mediclaim|star\s+health|icici\s+lombard|hdfc\s+ergo|bajaj\s+allianz\s+health/i, cat: 'Insurance', sub: 'Health Insurance', priority: 10 },

  // --- Dining ---
  { re: /zomato|swiggy|dunzo|magicpin|foodpanda|eatfit|box8|faasos|behrouz|biryani\s+blues/i, cat: 'Dining', sub: 'Food Delivery', merchantKey: 'food_delivery', priority: 10 },
  { re: /restaurant|food\b|cafe|biryani|pizza|dhaba|vasudha|domino|kfc|mcdonald|burger\s*king|subway|pizza\s+hut|barista|cafe\s+coffee|ccd|chaayos|starbucks|wendys|taco\s+bell|papa\s+johns|kristen|tandoor\s+stop/i, cat: 'Dining', sub: 'Restaurant', merchantKey: 'restaurant', priority: 10 },
  { re: /tiffin|dabba|tiffin/i, cat: 'Dining', sub: 'Tiffin / Dabba', priority: 5 },
  { re: /street\s*food|chaat|pav\s*bhaji|vada\s+pav|pani\s+puri|dosa|idli/i, cat: 'Dining', sub: 'Street Food', priority: 5 },
  { re: /takeaway|food\s+court|cafeteria|mess\b/i, cat: 'Dining', sub: 'Takeaway', priority: 3 },

  // --- Groceries ---
  { re: /grocery|groceries|vegetables?|vegetab|supermarket|amazon.*groc|dmart|reliance\s*fresh|big\s*bazaar|more\s+retail|nature.?s?\s*basket|jiomart|bigbasket|big\s*bas|spencers|hypermarket|relief|ration\s+shop|kirana/i, cat: 'Groceries', sub: 'Ration / Kirana', merchantKey: 'grocery', priority: 10 },
  { re: /vegetable|fruit|sabzi|fresh\s+produce|fruit\s+shop/i, cat: 'Groceries', sub: 'Vegetables / Fruits', priority: 5 },
  { re: /milk|dairy|amul|mother\s*dairy|nestle|amul\s+parlour|milk\s+booth/i, cat: 'Groceries', sub: 'Dairy / Milk', merchantKey: 'milk', priority: 10 },
  { re: /bakery|sweet|mithai|cake|pastry|confectionery/i, cat: 'Groceries', sub: 'Bakery / Sweets', priority: 5 },
  { re: /spice|masala|masala\s+shop/i, cat: 'Groceries', sub: 'Spices / Masala', priority: 5 },
  { re: /dry\s*fruits|nuts|cashew|almond|kishmish/i, cat: 'Groceries', sub: 'Dry Fruits', priority: 5 },

  // --- Transport ---
  { re: /filling\s*sta|fuel|petrol|petroleum|bunk|nayara|bharat\s*petroleum|hp\s*petrol|indian\s*oil|ioc|shell|reliance\s+petrol|total\s+petrol/i, cat: 'Transport', sub: 'Petrol / Fuel', merchantKey: 'fuel', priority: 10 },
  { re: /rapido/i, cat: 'Transport', sub: 'Rapido', merchantKey: 'rapido', priority: 10 },
  { re: /\bola\b|uber|cab\b|taxi|meru\s+cab|savaari|go\s+cab/i, cat: 'Transport', sub: 'Ola / Uber', merchantKey: 'cab', priority: 10 },
  { re: /auto|rickshaw|auto\s+rickshaw/i, cat: 'Transport', sub: 'Auto / Rickshaw', merchantKey: 'auto', priority: 10 },
  { re: /metro|delhi\s+metro|mumbai\s+metro|blr\s+metro|chennai\s+metro|hmr/i, cat: 'Transport', sub: 'Metro Card', priority: 10 },
  { re: /bus\s*pass|bus\s*ticket|redbus|abhibus|apsrtc|ksrtc|msrtc|upsrtc|tsrtc|karnataka\s+state|tnstc|gmtc|pmt/i, cat: 'Transport', sub: 'Bus Pass', priority: 10 },
  { re: /irctc|rail|train\b|railway|irfc|indian\s+rail|confirmtkt|ixigo\s+trains/i, cat: 'Transport', sub: 'Travel / Train', priority: 10 },
  { re: /flight|airlines|air\s*india|indigo|spicejet|go\s*air|airasia|vistara|akasa|go\s+first/i, cat: 'Transport', sub: 'Flight', priority: 10 },
  { re: /vehicle\s*service|car\s*service|workshop|garage|tyre|tyre\s+shop|service\s+station|motor\s+repair/i, cat: 'Transport', sub: 'Auto Maintenance', priority: 5 },
  { re: /toll|plaza|toll\s+plaza|nhai|fastag/i, cat: 'Transport', sub: 'Toll Charges', priority: 5 },
  { re: /parking|car\s+park|valet\s+park/i, cat: 'Transport', sub: 'Parking', priority: 3 },
  { re: /vehicle\s*insurance|car\s*insurance|two\s*wheeler\s+insurance/i, cat: 'Insurance', sub: 'Vehicle Insurance', priority: 10 },
  { re: /bike|bicycle|cycle|bicycle\s+rental/i, cat: 'Transport', sub: 'Bike / Bicycle', priority: 3 },

  // --- Entertainment ---
  { re: /cinema|cinepolis|pvr|inox|bookmyshow|insider|justickets|movieticket/i, cat: 'Entertainment', sub: 'Movie Tickets', merchantKey: 'cinema', priority: 10 },
  { re: /netflix|prime\s*video|hotstar|disney|alt\s*balaji|zee5|sony\s*liv|jio\s+cinema|eros\s+now|voot|mx\s+player/i, cat: 'Entertainment', sub: 'Online Streaming', merchantKey: 'streaming', priority: 10 },
  { re: /spotify|wynk|gaana|jio\s+saavn|youtube\s+premium|iTunes|apple\s+music|pocket\s+fm|gaana\s+plus/i, cat: 'Entertainment', sub: 'Music / Concerts', priority: 5 },
  { re: /liquor|wine|beer|bar\b|spirits|vodka|whisky|rum|brandy|old\s+monk|kingfisher|tuborg|magic\s+pin/i, cat: 'Entertainment', sub: 'Liquor / Bar', priority: 5 },
  { re: /sports|game|gaming|steam|playstation|xbox|nintendo|esports|esports|gaming\s+zone/i, cat: 'Entertainment', sub: 'Gaming', priority: 5 },
  { re: /club\s*membership|club\s*fee|country\s+club/i, cat: 'Entertainment', sub: 'Club Membership', priority: 3 },
  { re: /book|magazine|kindle|audible|comic|novel|storytel/i, cat: 'Entertainment', sub: 'Books / Magazines', priority: 3 },
  { re: /netflix\s+subscription|prime\s+subscription|hotstar\s+sub|subscription/i, cat: 'Entertainment', sub: 'Online Streaming', priority: 8 },
  { re: /disney|zee5|sonyliv|jio\s+cinema|voot/i, cat: 'Entertainment', sub: 'Online Streaming', priority: 5 },

  // --- Utilities ---
  { re: /electricity|bescom|tsspdcl|tneb|msedcl|bses|tata\s*power|adani\s*electricity|cesc|gseb|mp\s+electricity|kseb|pspcl|reliance\s+power/i, cat: 'Utilities', sub: 'Electricity Bill', merchantKey: 'electricity', priority: 10 },
  { re: /water\s*bill|water\s*tan|waterboard|jals|water\s+works|municipal\s+corp/i, cat: 'Utilities', sub: 'Water Bill', priority: 5 },
  { re: /broadband|internet|jiofiber|airtel\s*fiber|bsnl|hathway|spectra|act\s+corp|den\s+broadband|youbroadband|excitel|trikon/i, cat: 'Utilities', sub: 'Broadband Bills', merchantKey: 'broadband', priority: 10 },
  { re: /mobile\s*recharge|prepaid|postpaid|airtel\s*mobile|jio\s*mobile|vi\b|vodafone|recharge|topup|mobile\s+topup/i, cat: 'Utilities', sub: 'Mobile Recharge', merchantKey: 'mobile', priority: 10 },
  { re: /dish\s*tv|tata\s*sky|sun\s*direct|d2h\b|videocon\s+d2h|airtel\s+tv|jio\s+tv/i, cat: 'Utilities', sub: 'Dish TV', priority: 5 },
  { re: /gas\s*cylinder|hp\s*gas|indane|bharat\s*gas|mahanagar|supreme/i, cat: 'Utilities', sub: 'Gas Cylinder', priority: 10 },
  { re: /maintenance|society|apartment|flat\s*fee|society\s+maintenance|club\s+house/i, cat: 'Utilities', sub: 'Monthly Apartment Maintenance', merchantKey: 'maintenance', priority: 10 },
  { re: /maid|housekeep|alavala|maddim|cleaning|house\s+help/i, cat: 'Utilities', sub: 'Maid Expenses', priority: 5 },
  { re: /cook|salary/i, cat: 'Utilities', sub: 'Cook / Cook Salary', priority: 3 },
  { re: /watchman|security/i, cat: 'Utilities', sub: 'Watchman / Security', priority: 3 },
  { re: /property\s*tax|municipal\s+tax|property\s+tax/i, cat: 'Utilities', sub: 'Property Tax', priority: 5 },
  { re: /piped\s+gas|city\s+gas|gas\s+bill/i, cat: 'Utilities', sub: 'Gas Cylinder', priority: 5 },
  { re: /sewage|drainage|sanitation/i, cat: 'Utilities', sub: 'Miscellaneous', priority: 3 },

  // --- Insurance ---
  { re: /lic\b|life\s*insurance|bajaj\s+allianz|hdfc\s+life|icici\s*pru|max\s*life|sbi\s+life|kotak\s+life|reliance\s+life|tata\s+life/i, cat: 'Insurance', sub: 'LIC Premium', merchantKey: 'lic', priority: 10 },
  { re: /home\s*insurance|home\s+policy/i, cat: 'Insurance', sub: 'Home Insurance', priority: 5 },
  { re: /travel\s*insurance/i, cat: 'Insurance', sub: 'Travel Insurance', priority: 5 },
  { re: /term\s*plan|term\s*insurance|endowment|money\s+back/i, cat: 'Insurance', sub: 'LIC / Term Plan', priority: 5 },
  { re: /two\s*wheeler\s+insurance|car\s+insurance|bike\s+insurance|vehicle\s+insurance/i, cat: 'Insurance', sub: 'Vehicle Insurance', priority: 10 },
  { re: /medical\s+insurance|health\s+policy|mediclaim|star\s+health|hdfc\s+ergo|icici\s+lombard|bajaj\s+allianz/i, cat: 'Insurance', sub: 'Health Insurance', priority: 10 },

  // --- Education ---
  { re: /tuition|coaching|vedantu|byjus|unacademy|gradeup|testbook|khan\s+academy|skillshare|udemy|coursera|edx/i, cat: 'Education', sub: 'Tuition / Coaching', merchantKey: 'tuition', priority: 10 },
  { re: /school\s*fees|college\s*fees|university\s*fees|admission\s+fee|tuition\s+fee/i, cat: 'Education', sub: 'School Fees', merchantKey: 'school', priority: 10 },
  { re: /exam\s*fees|application\s+fees|form\s+fee/i, cat: 'Education', sub: 'Exam Fees', priority: 5 },
  { re: /book|stationery|pen|notebook|notebook\s+store|classmate|doms/i, cat: 'Education', sub: 'Books & Stationery', priority: 5 },
  { re: /library|membership\s+fee/i, cat: 'Education', sub: 'Books / Magazines', priority: 3 },

  // --- Investment / Savings ---
  { re: /mutual\s*fund|sip\b|franklin\s+templeton|icici\s+prudential|hdfc\s+mf|sbi\s+mf|kotak\s+mf|nippon\s+india|axis\s+mf/i, cat: 'Investment', sub: 'Mutual Funds', merchantKey: 'mf', priority: 10 },
  { re: /stock|share|demat|zerodha|groww|upstox|5paisa|angel\s+broking|sharekhan|icici\s+direct|kotak\s+securities/i, cat: 'Investment', sub: 'Stocks / Shares', merchantKey: 'stocks', priority: 10 },
  { re: /fixed\s+deposit|fd\b|recurring\s+deposit|rd\b|deposit/i, cat: 'Investment', sub: 'Fixed Deposit', merchantKey: 'fd', priority: 10 },
  { re: /ppf|provident\s*fund|epf|pf\s+withdrawal|nps|pension\s+fund/i, cat: 'Investment', sub: 'PPF / PF', merchantKey: 'ppf', priority: 10 },
  { re: /nsc|kvp|kisan\s+vikas|post\s+office\s+deposit/i, cat: 'Investment', sub: 'NSC / KVP', priority: 5 },
  { re: /gold\s*invest|jewellery|jewel|gold\s+coin|sovereign\s+gold|sgb|kalyan\s+jewellers|tanishq|joyalukkas|malabar/i, cat: 'Investment', sub: 'Gold Investment', priority: 10 },
  { re: /emergency\s+fund/i, cat: 'Investment', sub: 'Emergency Fund', priority: 5 },
  { re: /pension|pension\s+scheme|atal\s+pension/i, cat: 'Investment', sub: 'Pension Plan', priority: 5 },
  { re: /chit\s+fund|chitty/i, cat: 'Investment', sub: 'Chit Fund', priority: 5 },
  { re: /sukanya\s+samriddhi|kvp|post\s+office/i, cat: 'Investment', sub: 'Savings Scheme', priority: 5 },

  // --- Gifts / Cultural ---
  { re: /saree|sarees|fashion|apparel|clothing|garment|myntra|ajio|nykaa|fbb|max\s+fashion|westside|pantaloons|hm|zara|hm\s+online/i, cat: 'Other', sub: 'Sarees / Clothing', merchantKey: 'clothing', priority: 10 },
  { re: /pooja|religious|temple|donation|dakshina|hundi|pooja\s+items/i, cat: 'Other', sub: 'Pooja / Religious', priority: 5 },
  { re: /festival|diwali|holi|eid|christmas|pongal|onam|bihu|ganesh\s+chaturthi/i, cat: 'Other', sub: 'Festival Shopping', priority: 5 },
  { re: /wedding\s*gift|shagun|wedding/i, cat: 'Gifts', sub: 'Wedding Gift', priority: 5 },
  { re: /gift\s+card|gift\s+voucher|gift\s+pack/i, cat: 'Gifts', priority: 3 },
  { re: /electronics|gadget|mobile|phone|laptop|computer|croma|reliance\s*digital|vijay\s*sales|poorvika|sangeetha|zeven\s+seas|lotmobiles/i, cat: 'Other', sub: 'Electronics / Gadgets', merchantKey: 'electronics', priority: 10 },
  { re: /furniture|home\s+decor|ikea|pepperfry|urban\s+ladder|homecentre|nilkamal|godrej|durian/i, cat: 'Other', sub: 'Furniture / Home', priority: 5 },

  // --- Pets ---
  { re: /pet\b|paws|veterinary|vet\b|pet\s+care|dog\s+point|pet\s+shop/i, cat: 'Other', sub: 'Pets', priority: 5 },

  // --- Income (credits) ---
  { re: /salary|payroll|wages|credit\s+salary|salary\s+credited/i, cat: 'Income', sub: 'Salary', priority: 10 },
  { re: /freelance|consulting|upwork|fiverr|toptal|freelancer/i, cat: 'Income', sub: 'Freelance Income', priority: 10 },
  { re: /dividend|dividend\s+credited|interest\s+credited/i, cat: 'Income', sub: 'Dividends', priority: 5 },
  { re: /interest\s*(credited|earned|received)|credit\s*interest/i, cat: 'Income', sub: 'Interest Income', priority: 10 },
  { re: /refund|reversal/i, cat: 'Income', sub: 'Refund', priority: 5 },
  { re: /cashback|reward/i, cat: 'Income', sub: 'Cashback / Rewards', priority: 5 },
  { re: /rd\s*closure|recurring\s*deposit\s*closure|maturity\s+proceeds/i, cat: 'Income', sub: 'RD Closure', priority: 5 },
  { re: /gst\s+refund|income\s+tax\s+refund|itr\s+refund/i, cat: 'Income', sub: 'Tax Refund', priority: 5 },
  { re: /rent\s+received|rental\s+income/i, cat: 'Income', sub: 'Rental Income', priority: 5 },
  { re: /bonus|incentive|exgratia|arrear/i, cat: 'Income', sub: 'Bonus / Incentive', priority: 5 },
  { re: /gift\s+received|received\s+from/i, cat: 'Income', sub: 'Gift Received', priority: 3 },

  // --- Business ---
  { re: /business\s+income|client\s+payment|invoice\s+payment|professional\s+fee/i, cat: 'Business', sub: 'Business Income', priority: 10 },
  { re: /shop\s+rent|office\s+rent|rent\s+paid/i, cat: 'Business', sub: 'Shop Rent', priority: 5 },
  { re: /business\s+license|trade\s+license|gumasta|msme|udyam|gst\s+registration/i, cat: 'Business', sub: 'Business License', priority: 5 },
  { re: /gst\s+payment|gst\s+tax|output\s+gst|input\s+gst/i, cat: 'Business', sub: 'GST / Taxes', priority: 10 },
  { re: /business\s+travel|travel\s+advance|conveyance/i, cat: 'Business', sub: 'Business Travel', priority: 5 },
  { re: /client\s+entertainment|business\s+meal/i, cat: 'Business', sub: 'Client Entertainment', priority: 3 },
  { re: /office\s+supplies|stationery\s+office|printer|cartridge|office\s+desk/i, cat: 'Business', sub: 'Office Supplies', priority: 5 },
  { re: /employee\s+salary|staff\s+salary|payroll\s+salary/i, cat: 'Business', sub: 'Employee Salary', priority: 10 },

  // --- Online Shopping ---
  { re: /amazon|amazon\s+pay|flipkart|snapdeal|paytm\s+mall|mobiwik|shopclues/i, cat: 'Other', sub: 'Online Shopping', merchantKey: 'amazon', priority: 10 },
  { re: /myntra|ajio|nykaa|tatacliq|koovs|bewakoof|souledstore|zivame|shoppers\s+stop|pantaloons|westside/i, cat: 'Other', sub: 'Online Shopping', merchantKey: 'myntra', priority: 10 },
  { re: /google\s+pay|gpay|phonepe|paytm\s+wallet|mobikwik|freecharge|amazon\s+pay/i, cat: 'Other', sub: 'Digital Wallet', priority: 5 },

  // --- Other / Misc ---
  { re: /jewellery|jewel|gold\s+coin|diamond|silver/i, cat: 'Other', sub: 'Jewellery / Gold', priority: 5 },
  { re: /furniture|home\s+decor|ikea|pepperfry|urban\s+ladder|homecentre|nilkamal|godrej/i, cat: 'Other', sub: 'Furniture / Home', priority: 5 },
  { re: /pooja|religious|temple|donation|dakshina|hundi/i, cat: 'Other', sub: 'Pooja / Religious', priority: 5 },
  { re: /pet\b|paws|veterinary|vet\b|pet\s+care/i, cat: 'Other', sub: 'Pets', priority: 5 },
  { re: /repair|service\s+charge|repairing|maintenance/i, cat: 'Other', sub: 'Repairs & Maintenance', priority: 3 },
  { re: /laundry|dry\s+clean|iron/i, cat: 'Other', sub: 'Laundry / Dry Cleaning', priority: 3 },
  { re: /salon|parlour|spa|massage|beauty\s+parlour|unisex\s+salon|hair\s+cut/i, cat: 'Other', sub: 'Salon / Spa', priority: 5 },
  { re: /courier|courier\s+service|speedpost|indiapost|bluedart|dtdc|delhivery|ecom/i, cat: 'Other', sub: 'Courier / Logistics', priority: 5 },
  { re: /gym|fitness|yoga|aerobics|zumba|crossfit/i, cat: 'Health', sub: 'Gym / Fitness', priority: 5 },
  { re: /doctor|consultation|physio|ayurved|homeopath|clinic|hospital/i, cat: 'Health', sub: 'Doctor Consultation', priority: 3 },
  { re: /medicine|medicines|medical|health\s+store|wellness/i, cat: 'Health', sub: 'Pharmacy / Medicines', priority: 5 },

  // --- Credit card payments / transfers ---
  { re: /credit\s+card\s+payment|cc\s+payment|card\s+payment/i, cat: 'Other', sub: 'Credit Card Payment', priority: 5 },
  { re: /transfer\s+to|imps\s+transfer|neft\s+transfer|rtgs\s+transfer/i, cat: 'Other', sub: 'Transfer', priority: 3 },
  { re: /emi\s+payment|loan\s+emi|home\s+loan\s+emi|car\s+loan\s+emi|personal\s+loan/i, cat: 'Other', sub: 'Loan EMI', priority: 10 },
  { re: /cash\s+withdrawal|atm\s+withdrawal|atm\s+cash/i, cat: 'Other', sub: 'ATM Withdrawal', priority: 5 },
  { re: /bank\s+charges|service\s+charge|penalty|late\s+fee|cheque\s+bounce|sms\s+alert/i, cat: 'Other', sub: 'Bank Charges', priority: 5 },
];

export function describeCategory(description: string): CategorySuggestion | null {
  const normalised = normaliseDescription(description);
  let best: CategorySuggestion | null = null;
  for (const rule of RULES) {
    const score = scoreMatch(normalised, rule);
    if (score > 0 && (!best || score > best.confidence)) {
      best = {
        cat: rule.cat,
        sub: rule.sub,
        merchantKey: rule.merchantKey,
        confidence: Math.min(1, 0.5 + score / 50),
        matchedRule: rule.re.source,
      };
    }
  }
  return best;
}

export function merchantKeyFromDescription(description: string): string {
  const clean = description
    .replace(/\bUPI-\d+-/gi, '')
    .replace(/\bIMPS\d+-/gi, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const words = clean.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ');
}

export function describeCategoryLegacy(description: string): { cat: string; sub?: string; merchantKey?: string } | null {
  const result = describeCategory(description);
  if (!result) return null;
  return { cat: result.cat, sub: result.sub, merchantKey: result.merchantKey };
}
