import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════
// PALETTE
// ══════════════════════════════════════════════
const C = {
  bg:"#05070f", surface:"#0b0e1c", card:"#0f1221",
  border:"#182038", borderHi:"#243060",
  gold:"#f0a500", goldLt:"#ffcc5c",
  teal:"#00c9a7", red:"#ff4c6a", blue:"#4f8cff",
  purple:"#b05cff", orange:"#ff8c42", cyan:"#00d4e8",
  text:"#dde3f5", mid:"#7a88b0", dim:"#3a4565",
  font:"'Syne',sans-serif", mono:"'IBM Plex Mono',monospace",
};
const ACCENT = ["#f0a500","#00c9a7","#4f8cff","#ff4c6a","#b05cff","#ff8c42","#00d4e8"];

// ══════════════════════════════════════════════
// ISO2 → ISO3 (for IMF & WHO APIs)
// ══════════════════════════════════════════════
const ISO3 = {
  GH:"GHA",NG:"NGA",ZA:"ZAF",KE:"KEN",ET:"ETH",EG:"EGY",TZ:"TZA",UG:"UGA",
  SN:"SEN",CI:"CIV",MA:"MAR",TN:"TUN",RW:"RWA",AO:"AGO",CM:"CMR",ZM:"ZMB",
  ZW:"ZWE",BW:"BWA",NA:"NAM",MZ:"MOZ",MG:"MDG",MW:"MWI",DZ:"DZA",LY:"LBY",
  SD:"SDN",TD:"TCD",ML:"MLI",NE:"NER",BF:"BFA",BJ:"BEN",GN:"GIN",LS:"LSO",
  SZ:"SWZ",MU:"MUS",CV:"CPV",SC:"SYC",GA:"GAB",CG:"COG",CD:"COD",
  US:"USA",CA:"CAN",BR:"BRA",MX:"MEX",AR:"ARG",CL:"CHL",CO:"COL",PE:"PER",
  DE:"DEU",GB:"GBR",FR:"FRA",IT:"ITA",ES:"ESP",NL:"NLD",CH:"CHE",SE:"SWE",
  NO:"NOR",PL:"POL",CN:"CHN",JP:"JPN",IN:"IND",KR:"KOR",SG:"SGP",ID:"IDN",
  PK:"PAK",BD:"BGD",SA:"SAU",AE:"ARE",TR:"TUR",IL:"ISR",AU:"AUS",NZ:"NZL",
};

// ══════════════════════════════════════════════
// COUNTRIES
// ══════════════════════════════════════════════
const COUNTRIES = [
  {code:"GH",name:"Ghana",region:"Africa",flag:"🇬🇭",star:true},
  {code:"NG",name:"Nigeria",region:"Africa",flag:"🇳🇬"},
  {code:"ZA",name:"South Africa",region:"Africa",flag:"🇿🇦"},
  {code:"KE",name:"Kenya",region:"Africa",flag:"🇰🇪"},
  {code:"ET",name:"Ethiopia",region:"Africa",flag:"🇪🇹"},
  {code:"EG",name:"Egypt",region:"Africa",flag:"🇪🇬"},
  {code:"TZ",name:"Tanzania",region:"Africa",flag:"🇹🇿"},
  {code:"UG",name:"Uganda",region:"Africa",flag:"🇺🇬"},
  {code:"SN",name:"Senegal",region:"Africa",flag:"🇸🇳"},
  {code:"CI",name:"Côte d'Ivoire",region:"Africa",flag:"🇨🇮"},
  {code:"MA",name:"Morocco",region:"Africa",flag:"🇲🇦"},
  {code:"TN",name:"Tunisia",region:"Africa",flag:"🇹🇳"},
  {code:"RW",name:"Rwanda",region:"Africa",flag:"🇷🇼"},
  {code:"AO",name:"Angola",region:"Africa",flag:"🇦🇴"},
  {code:"CM",name:"Cameroon",region:"Africa",flag:"🇨🇲"},
  {code:"ZM",name:"Zambia",region:"Africa",flag:"🇿🇲"},
  {code:"ZW",name:"Zimbabwe",region:"Africa",flag:"🇿🇼"},
  {code:"BW",name:"Botswana",region:"Africa",flag:"🇧🇼"},
  {code:"NA",name:"Namibia",region:"Africa",flag:"🇳🇦"},
  {code:"MZ",name:"Mozambique",region:"Africa",flag:"🇲🇿"},
  {code:"MG",name:"Madagascar",region:"Africa",flag:"🇲🇬"},
  {code:"MW",name:"Malawi",region:"Africa",flag:"🇲🇼"},
  {code:"DZ",name:"Algeria",region:"Africa",flag:"🇩🇿"},
  {code:"LY",name:"Libya",region:"Africa",flag:"🇱🇾"},
  {code:"SD",name:"Sudan",region:"Africa",flag:"🇸🇩"},
  {code:"TD",name:"Chad",region:"Africa",flag:"🇹🇩"},
  {code:"ML",name:"Mali",region:"Africa",flag:"🇲🇱"},
  {code:"NE",name:"Niger",region:"Africa",flag:"🇳🇪"},
  {code:"BF",name:"Burkina Faso",region:"Africa",flag:"🇧🇫"},
  {code:"BJ",name:"Benin",region:"Africa",flag:"🇧🇯"},
  {code:"GN",name:"Guinea",region:"Africa",flag:"🇬🇳"},
  {code:"LS",name:"Lesotho",region:"Africa",flag:"🇱🇸"},
  {code:"SZ",name:"Eswatini",region:"Africa",flag:"🇸🇿"},
  {code:"MU",name:"Mauritius",region:"Africa",flag:"🇲🇺"},
  {code:"CV",name:"Cape Verde",region:"Africa",flag:"🇨🇻"},
  {code:"SC",name:"Seychelles",region:"Africa",flag:"🇸🇨"},
  {code:"GA",name:"Gabon",region:"Africa",flag:"🇬🇦"},
  {code:"CG",name:"Congo, Rep.",region:"Africa",flag:"🇨🇬"},
  {code:"CD",name:"Congo, Dem. Rep.",region:"Africa",flag:"🇨🇩"},
  {code:"US",name:"United States",region:"Americas",flag:"🇺🇸"},
  {code:"CA",name:"Canada",region:"Americas",flag:"🇨🇦"},
  {code:"BR",name:"Brazil",region:"Americas",flag:"🇧🇷"},
  {code:"MX",name:"Mexico",region:"Americas",flag:"🇲🇽"},
  {code:"AR",name:"Argentina",region:"Americas",flag:"🇦🇷"},
  {code:"CL",name:"Chile",region:"Americas",flag:"🇨🇱"},
  {code:"CO",name:"Colombia",region:"Americas",flag:"🇨🇴"},
  {code:"PE",name:"Peru",region:"Americas",flag:"🇵🇪"},
  {code:"DE",name:"Germany",region:"Europe",flag:"🇩🇪"},
  {code:"GB",name:"United Kingdom",region:"Europe",flag:"🇬🇧"},
  {code:"FR",name:"France",region:"Europe",flag:"🇫🇷"},
  {code:"IT",name:"Italy",region:"Europe",flag:"🇮🇹"},
  {code:"ES",name:"Spain",region:"Europe",flag:"🇪🇸"},
  {code:"NL",name:"Netherlands",region:"Europe",flag:"🇳🇱"},
  {code:"CH",name:"Switzerland",region:"Europe",flag:"🇨🇭"},
  {code:"SE",name:"Sweden",region:"Europe",flag:"🇸🇪"},
  {code:"NO",name:"Norway",region:"Europe",flag:"🇳🇴"},
  {code:"PL",name:"Poland",region:"Europe",flag:"🇵🇱"},
  {code:"CN",name:"China",region:"Asia",flag:"🇨🇳"},
  {code:"JP",name:"Japan",region:"Asia",flag:"🇯🇵"},
  {code:"IN",name:"India",region:"Asia",flag:"🇮🇳"},
  {code:"KR",name:"South Korea",region:"Asia",flag:"🇰🇷"},
  {code:"SG",name:"Singapore",region:"Asia",flag:"🇸🇬"},
  {code:"ID",name:"Indonesia",region:"Asia",flag:"🇮🇩"},
  {code:"PK",name:"Pakistan",region:"Asia",flag:"🇵🇰"},
  {code:"BD",name:"Bangladesh",region:"Asia",flag:"🇧🇩"},
  {code:"SA",name:"Saudi Arabia",region:"Middle East",flag:"🇸🇦"},
  {code:"AE",name:"UAE",region:"Middle East",flag:"🇦🇪"},
  {code:"TR",name:"Turkey",region:"Middle East",flag:"🇹🇷"},
  {code:"IL",name:"Israel",region:"Middle East",flag:"🇮🇱"},
  {code:"AU",name:"Australia",region:"Oceania",flag:"🇦🇺"},
  {code:"NZ",name:"New Zealand",region:"Oceania",flag:"🇳🇿"},
];
const REGIONS = ["All","Africa","Americas","Europe","Asia","Middle East","Oceania"];
const YEARS = Array.from({length:65},(_,i)=>1960+i);

// ══════════════════════════════════════════════
// DATA SOURCES — MACRO LEVEL
// ══════════════════════════════════════════════
const MACRO_SOURCES = [
  {
    id:"worldbank", name:"World Bank", short:"WB", region:"Global", color:"#4f8cff",
    desc:"World Bank Open Data — 1,400+ global development indicators, free, no key needed.",
    url:"https://data.worldbank.org", keyRequired:false,
    vars:[
      // Output
      {code:"NY.GDP.MKTP.CD",name:"GDP (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GDP.PCAP.CD",name:"GDP per Capita (USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"GDP Growth Rate (%)",cat:"Output",fmt:"pct"},
      {code:"NY.GDP.MKTP.KD",name:"GDP (Constant 2015 USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.MKTP.CD",name:"GNI (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.PCAP.CD",name:"GNI per Capita (USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.PCAP.PP.CD",name:"GNI per Capita PPP (Intl $)",cat:"Output",fmt:"currency"},
      // Prices
      {code:"FP.CPI.TOTL.ZG",name:"Inflation Rate — CPI (%)",cat:"Prices",fmt:"pct"},
      {code:"FP.CPI.TOTL",name:"Consumer Price Index (2010=100)",cat:"Prices",fmt:"num"},
      {code:"NY.GDP.DEFL.KD.ZG",name:"Inflation — GDP Deflator (%)",cat:"Prices",fmt:"pct"},
      // Labour
      {code:"SL.UEM.TOTL.ZS",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.UEM.1524.ZS",name:"Youth Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.UEM.TOTL.FE.ZS",name:"Female Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.TLF.ACTI.ZS",name:"Labour Force Participation Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.TLF.ACTI.FE.ZS",name:"Female Labour Force Participation (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.EMP.TOTL.SP.ZS",name:"Employment-to-Population Ratio (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.AGR.EMPL.ZS",name:"Employment in Agriculture (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.SRV.EMPL.ZS",name:"Employment in Services (%)",cat:"Labour",fmt:"pct"},
      // Trade
      {code:"NE.EXP.GNFS.ZS",name:"Exports of Goods & Services % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.IMP.GNFS.ZS",name:"Imports of Goods & Services % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.EXP.GNFS.CD",name:"Exports (Current USD)",cat:"Trade",fmt:"currency"},
      {code:"NE.IMP.GNFS.CD",name:"Imports (Current USD)",cat:"Trade",fmt:"currency"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.TRD.GNFS.ZS",name:"Trade Openness % GDP",cat:"Trade",fmt:"pct"},
      // Investment
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Net Inflows % GDP",cat:"Investment",fmt:"pct"},
      {code:"BX.KLT.DINV.CD.WD",name:"FDI Net Inflows (Current USD)",cat:"Investment",fmt:"currency"},
      {code:"BM.KLT.DINV.CD.WD",name:"FDI Net Outflows (Current USD)",cat:"Investment",fmt:"currency"},
      {code:"NE.GDI.TOTL.ZS",name:"Gross Capital Formation % GDP",cat:"Investment",fmt:"pct"},
      // Fiscal
      {code:"GC.DOD.TOTL.GD.ZS",name:"Government Debt % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.REV.XGRT.GD.ZS",name:"Government Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.XPN.TOTL.GD.ZS",name:"Government Expenditure % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.TAX.TOTL.GD.ZS",name:"Tax Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.NLD.TOTL.GD.ZS",name:"Fiscal Balance (Net Lending) % GDP",cat:"Fiscal",fmt:"pct"},
      // Demographics
      {code:"SP.POP.TOTL",name:"Total Population",cat:"Demographics",fmt:"num"},
      {code:"SP.POP.GROW",name:"Population Growth Rate (%)",cat:"Demographics",fmt:"pct"},
      {code:"SP.URB.TOTL.IN.ZS",name:"Urban Population (%)",cat:"Demographics",fmt:"pct"},
      {code:"SP.DYN.LE00.IN",name:"Life Expectancy at Birth (years)",cat:"Demographics",fmt:"num"},
      {code:"SP.DYN.IMRT.IN",name:"Infant Mortality Rate (per 1,000)",cat:"Demographics",fmt:"num"},
      {code:"SP.DYN.TFRT.IN",name:"Fertility Rate (births per woman)",cat:"Demographics",fmt:"num"},
      // Finance & Money
      {code:"FM.LBL.BMNY.GD.ZS",name:"M2 Money Supply % GDP",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.RINR",name:"Real Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"PA.NUS.FCRF",name:"Official Exchange Rate (LCU per USD)",cat:"Finance",fmt:"num"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Domestic Credit to Private Sector % GDP",cat:"Finance",fmt:"pct"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Finance",fmt:"pct"},
      // Social
      {code:"SH.XPD.CHEX.GD.ZS",name:"Health Expenditure % GDP",cat:"Social",fmt:"pct"},
      {code:"SE.XPD.TOTL.GD.ZS",name:"Education Expenditure % GDP",cat:"Social",fmt:"pct"},
      {code:"SI.POV.GINI",name:"Gini Coefficient (Inequality)",cat:"Social",fmt:"num"},
      {code:"SI.POV.NAHC",name:"National Poverty Rate (%)",cat:"Social",fmt:"pct"},
      {code:"SI.POV.DDAY",name:"Poverty Rate < $2.15/day (%)",cat:"Social",fmt:"pct"},
      // Environment
      {code:"EN.ATM.CO2E.PC",name:"CO2 Emissions per Capita (metric tons)",cat:"Environment",fmt:"num"},
      {code:"EN.ATM.CO2E.KT",name:"Total CO2 Emissions (kt)",cat:"Environment",fmt:"num"},
      {code:"EG.USE.PCAP.KG.OE",name:"Energy Use per Capita (kg oil equiv)",cat:"Environment",fmt:"num"},
      {code:"EG.ELC.ACCS.ZS",name:"Access to Electricity (%)",cat:"Environment",fmt:"pct"},
      {code:"EG.FEC.RNEW.ZS",name:"Renewable Energy Consumption (%)",cat:"Environment",fmt:"pct"},
      {code:"AG.LND.FRST.ZS",name:"Forest Area (% of land)",cat:"Environment",fmt:"pct"},
      // Technology
      {code:"IT.NET.USER.ZS",name:"Internet Users (%)",cat:"Technology",fmt:"pct"},
      {code:"IT.CEL.SETS.P2",name:"Mobile Subscriptions per 100 people",cat:"Technology",fmt:"num"},
    ]
  },
  {
    id:"imf", name:"IMF — World Economic Outlook", short:"IMF", region:"Global", color:"#00c9a7",
    desc:"IMF WEO Database — macroeconomic projections and historical data, free, no key needed.",
    url:"https://www.imf.org/en/Publications/WEO", keyRequired:false,
    vars:[
      {code:"NGDP_RPCH",name:"Real GDP Growth (%)",cat:"Output",fmt:"pct"},
      {code:"NGDPD",name:"GDP, Current Prices (USD billions)",cat:"Output",fmt:"num"},
      {code:"NGDPDPC",name:"GDP per Capita (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NGDP_D",name:"GDP Deflator Index",cat:"Prices",fmt:"num"},
      {code:"PCPIPCH",name:"Inflation, Avg Consumer Prices (%)",cat:"Prices",fmt:"pct"},
      {code:"PCPIEPCH",name:"Inflation, End of Period (%)",cat:"Prices",fmt:"pct"},
      {code:"LUR",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"LP",name:"Population (millions)",cat:"Demographics",fmt:"num"},
      {code:"BCA",name:"Current Account Balance (USD billions)",cat:"Trade",fmt:"num"},
      {code:"BCA_NGDPD",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct"},
      {code:"TM_RPCH",name:"Import Volume Growth (%)",cat:"Trade",fmt:"pct"},
      {code:"TX_RPCH",name:"Export Volume Growth (%)",cat:"Trade",fmt:"pct"},
      {code:"GGXWDG_NGDP",name:"Gross Government Debt % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGXCNL_NGDP",name:"Fiscal Balance % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGREV_NGDP",name:"Government Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGEXP_NGDP",name:"Government Expenditure % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"NGSD_NGDP",name:"Gross National Savings % GDP",cat:"Investment",fmt:"pct"},
      {code:"NID_NGDP",name:"Total Investment % GDP",cat:"Investment",fmt:"pct"},
    ]
  },
  {
    id:"fred", name:"Federal Reserve — FRED", short:"FRED", region:"USA", color:"#ff4c6a",
    desc:"St. Louis Fed — 800,000+ US & global economic time series. Requires a free FRED API key.",
    url:"https://fred.stlouisfed.org", keyRequired:true,
    keyLabel:"FRED API Key", keyLink:"https://fred.stlouisfed.org/docs/api/api_key.html",
    countryFixed:"US",
    vars:[
      {code:"GDP",name:"US GDP (Billions USD)",cat:"Output",fmt:"num"},
      {code:"GDPC1",name:"Real GDP (Billions Chained 2017 USD)",cat:"Output",fmt:"num"},
      {code:"A191RL1Q225SBEA",name:"Real GDP Growth Rate (%)",cat:"Output",fmt:"pct"},
      {code:"UNRATE",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"PAYEMS",name:"Nonfarm Payrolls (thousands)",cat:"Labour",fmt:"num"},
      {code:"CIVPART",name:"Labour Force Participation Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"CPIAUCSL",name:"CPI All Items (Index 1982-84=100)",cat:"Prices",fmt:"num"},
      {code:"CPILFESL",name:"Core CPI (excl. Food & Energy)",cat:"Prices",fmt:"num"},
      {code:"PCEPI",name:"PCE Price Index",cat:"Prices",fmt:"num"},
      {code:"FEDFUNDS",name:"Federal Funds Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"GS10",name:"10-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"GS2",name:"2-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"GS30",name:"30-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"M2SL",name:"M2 Money Supply (Billions USD)",cat:"Finance",fmt:"num"},
      {code:"DEXUSEU",name:"USD/EUR Exchange Rate",cat:"Finance",fmt:"num"},
      {code:"DEXCHUS",name:"Chinese Yuan per USD",cat:"Finance",fmt:"num"},
      {code:"DEXJPUS",name:"Japanese Yen per USD",cat:"Finance",fmt:"num"},
      {code:"HOUST",name:"Housing Starts (thousands, SAAR)",cat:"Housing",fmt:"num"},
      {code:"CSUSHPISA",name:"Case-Shiller Home Price Index",cat:"Housing",fmt:"num"},
      {code:"INDPRO",name:"Industrial Production Index",cat:"Industry",fmt:"num"},
      {code:"UMCSENT",name:"U. Michigan Consumer Sentiment",cat:"Sentiment",fmt:"num"},
      {code:"RSXFS",name:"Retail Sales excl. Food Services (M USD)",cat:"Consumption",fmt:"num"},
      {code:"DPCERAS3Q086SBEA",name:"Real Personal Consumption (B USD)",cat:"Consumption",fmt:"num"},
    ]
  },
  {
    id:"bog", name:"Bank of Ghana", short:"BoG", region:"Ghana", color:"#f0a500",
    desc:"Bank of Ghana monetary & financial data for Ghana. Data sourced via World Bank and IMF APIs.",
    url:"https://www.bog.gov.gh/economic-data/", keyRequired:false,
    countryFixed:"GH",
    note:"Live data via World Bank & IMF. For granular monthly data visit bog.gov.gh directly.",
    vars:[
      {code:"FP.CPI.TOTL.ZG",name:"Ghana Inflation Rate — CPI (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.LEND",name:"Ghana Lending Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Ghana Deposit Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.RINR",name:"Ghana Real Interest Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"PA.NUS.FCRF",name:"GHS / USD Official Exchange Rate",cat:"Monetary",fmt:"num",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"M2 Money Supply % GDP",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Private Sector Credit % GDP",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"Ghana GDP Growth Rate (%)",cat:"Output",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MKTP.CD",name:"Ghana GDP (Current USD)",cat:"Output",fmt:"currency",api:"worldbank"},
      {code:"NY.GDP.PCAP.CD",name:"Ghana GDP per Capita (USD)",cat:"Output",fmt:"currency",api:"worldbank"},
      {code:"GC.DOD.TOTL.GD.ZS",name:"Ghana Govt Debt % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.REV.XGRT.GD.ZS",name:"Ghana Govt Revenue % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.XPN.TOTL.GD.ZS",name:"Ghana Govt Expenditure % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"Ghana FDI Inflows % GDP",cat:"Investment",fmt:"pct",api:"worldbank"},
      {code:"NE.EXP.GNFS.CD",name:"Ghana Total Exports (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.IMP.GNFS.CD",name:"Ghana Total Imports (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Ghana Current Account % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"PCPIPCH",name:"Ghana Inflation — IMF Estimate (%)",cat:"Monetary",fmt:"pct",api:"imf"},
      {code:"GGXWDG_NGDP",name:"Ghana Gross Debt % GDP — IMF",cat:"Fiscal",fmt:"pct",api:"imf"},
      {code:"NGDP_RPCH",name:"Ghana Real GDP Growth — IMF (%)",cat:"Output",fmt:"pct",api:"imf"},
    ]
  },
  {
    id:"bis", name:"Bank for Intl. Settlements (BIS)", short:"BIS", region:"Global", color:"#00d4e8",
    desc:"BIS financial stability, banking & credit statistics. Served via World Bank aligned indicators.",
    url:"https://www.bis.org/statistics/", keyRequired:false,
    vars:[
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"Broad Money M2 % GDP",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Private Sector Credit % GDP",cat:"Credit",fmt:"pct",api:"worldbank"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.BNK.CAPA.ZS",name:"Bank Capital to Assets Ratio (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.CBK.BRCH.P5",name:"Bank Branches per 100,000 adults",cat:"Banking",fmt:"num",api:"worldbank"},
      {code:"FX.OWN.TOTL.ZS",name:"Account Ownership at Financial Institution (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"unctad", name:"UNCTAD — Trade & Investment", short:"UNCTAD", region:"Global", color:"#ff8c42",
    desc:"UN Conference on Trade and Development — trade, FDI and development statistics.",
    url:"https://unctad.org/statistics", keyRequired:false,
    vars:[
      {code:"NE.EXP.GNFS.CD",name:"Exports of Goods & Services (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.IMP.GNFS.CD",name:"Imports of Goods & Services (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.EXP.GNFS.ZS",name:"Exports % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"NE.IMP.GNFS.ZS",name:"Imports % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"NE.TRD.GNFS.ZS",name:"Trade Openness (Exports+Imports % GDP)",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.CD.WD",name:"FDI Inflows (Current USD)",cat:"Investment",fmt:"currency",api:"worldbank"},
      {code:"BM.KLT.DINV.CD.WD",name:"FDI Outflows (Current USD)",cat:"Investment",fmt:"currency",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Inflows % GDP",cat:"Investment",fmt:"pct",api:"worldbank"},
      {code:"DT.DOD.DECT.CD",name:"External Debt (Current USD)",cat:"Debt",fmt:"currency",api:"worldbank"},
      {code:"DT.DOD.DECT.GN.ZS",name:"External Debt % GNI",cat:"Debt",fmt:"pct",api:"worldbank"},
    ]
  },
];

// ══════════════════════════════════════════════
// DATA SOURCES — MICRO LEVEL
// ══════════════════════════════════════════════
const MICRO_SOURCES = [
  {
    id:"who", name:"WHO — Global Health Observatory", short:"WHO", region:"Global", color:"#b05cff",
    desc:"World Health Organization — health statistics, disease burden and health system indicators.",
    url:"https://www.who.int/data/gho", keyRequired:false,
    vars:[
      {code:"WHOSIS_000001",name:"Life Expectancy at Birth (years)",cat:"Mortality",fmt:"num"},
      {code:"WHOSIS_000002",name:"Healthy Life Expectancy at Birth (years)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000001",name:"Infant Mortality Rate (per 1,000 live births)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000003",name:"Under-5 Mortality Rate (per 1,000)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000026",name:"Maternal Mortality Ratio (per 100,000)",cat:"Mortality",fmt:"num"},
      {code:"HIV_0000000001",name:"HIV Prevalence Adults 15-49 (%)",cat:"Infectious Disease",fmt:"pct"},
      {code:"MDG_0000000020",name:"Tuberculosis Incidence (per 100,000)",cat:"Infectious Disease",fmt:"num"},
      {code:"MALARIA_EST_INCIDENCE",name:"Malaria Incidence (per 1,000 at risk)",cat:"Infectious Disease",fmt:"num"},
      {code:"NCD_BMI_30C",name:"Obesity Prevalence — Adults (%)",cat:"NCDs",fmt:"pct"},
      {code:"NCD_HYP_PREVALENCE_A",name:"Hypertension Prevalence (%)",cat:"NCDs",fmt:"pct"},
      {code:"NCD_GLUC_04",name:"Diabetes Prevalence (%)",cat:"NCDs",fmt:"pct"},
      {code:"SA_0000001462",name:"Alcohol Consumption (litres per capita)",cat:"Risk Factors",fmt:"num"},
      {code:"M_Est_smk_curr_std",name:"Current Tobacco Use — Adults (%)",cat:"Risk Factors",fmt:"pct"},
      {code:"WSH_WATER_SAFELY_MANAGED",name:"Population using safely managed water (%)",cat:"WASH",fmt:"pct"},
      {code:"WSH_SANITATION_SAFELY_MANAGED",name:"Population using safely managed sanitation (%)",cat:"WASH",fmt:"pct"},
      {code:"HWF_0001",name:"Physicians (per 10,000 population)",cat:"Health System",fmt:"num"},
      {code:"HWF_0007",name:"Nurses & Midwives (per 10,000)",cat:"Health System",fmt:"num"},
      {code:"GHED_CHE_pc_US_SHA2011",name:"Health Spending per Capita (USD)",cat:"Health System",fmt:"currency"},
      {code:"UHC_INDEX_REPORTED",name:"UHC Service Coverage Index (0–100)",cat:"Health System",fmt:"num"},
    ]
  },
  {
    id:"ilo", name:"ILO — ILOSTAT Labour Stats", short:"ILO", region:"Global", color:"#00d4e8",
    desc:"ILO labour market data — served via World Bank aligned indicators (ILO-sourced).",
    url:"https://ilostat.ilo.org", keyRequired:false,
    vars:[
      {code:"SL.UEM.TOTL.ZS",name:"Total Unemployment Rate (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.1524.ZS",name:"Youth Unemployment Rate 15-24 (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.TOTL.FE.ZS",name:"Female Unemployment Rate (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.ACTI.ZS",name:"Labour Force Participation Rate (%)",cat:"Labour Force",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.ACTI.FE.ZS",name:"Female Labour Force Participation (%)",cat:"Labour Force",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.TOTL.IN",name:"Total Labour Force (persons)",cat:"Labour Force",fmt:"num",api:"worldbank"},
      {code:"SL.EMP.TOTL.SP.ZS",name:"Employment-to-Population Ratio (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.EMP.SELF.ZS",name:"Self-Employed Workers (% of total)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.AGR.EMPL.ZS",name:"Employment in Agriculture (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.IND.EMPL.ZS",name:"Employment in Industry (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.SRV.EMPL.ZS",name:"Employment in Services (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.FAM.WORK.ZS",name:"Contributing Family Workers (%)",cat:"Informality",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"wbpov", name:"World Bank — Poverty & Inequality", short:"WB-P", region:"Global", color:"#4f8cff",
    desc:"World Bank Poverty & Inequality Platform — welfare, poverty and distributional data.",
    url:"https://pip.worldbank.org", keyRequired:false,
    vars:[
      {code:"SI.POV.DDAY",name:"Poverty Headcount < $2.15/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.LMIC",name:"Poverty Headcount < $3.65/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.UMIC",name:"Poverty Headcount < $6.85/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.NAHC",name:"National Poverty Rate (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.GINI",name:"Gini Coefficient (0–100, higher = more unequal)",cat:"Inequality",fmt:"num",api:"worldbank"},
      {code:"SI.DST.10TH.10",name:"Income Share — Highest 10% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.FRST.20",name:"Income Share — Lowest 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.05TH.20",name:"Income Share — Highest 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.SPR.PCAP",name:"Survey Mean Consumption/Income (2017 PPP $)",cat:"Welfare",fmt:"currency",api:"worldbank"},
      {code:"SI.SPR.PC40",name:"Income Growth — Bottom 40% (%)",cat:"Welfare",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"unesco", name:"UNESCO — UIS Education Data", short:"UIS", region:"Global", color:"#ff8c42",
    desc:"UNESCO Institute for Statistics — global education monitoring data.",
    url:"https://uis.unesco.org", keyRequired:false,
    vars:[
      {code:"SE.ADT.LITR.ZS",name:"Adult Literacy Rate — 15+ (%)",cat:"Literacy",fmt:"pct",api:"worldbank"},
      {code:"SE.ADT.1524.LT.ZS",name:"Youth Literacy Rate 15-24 (%)",cat:"Literacy",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.ENRR",name:"Primary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.SEC.ENRR",name:"Secondary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.TER.ENRR",name:"Tertiary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.TENR",name:"Primary Enrollment — Net (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.CMPT.ZS",name:"Primary Completion Rate (%)",cat:"Attainment",fmt:"pct",api:"worldbank"},
      {code:"SE.SEC.CMPT.LO.ZS",name:"Lower Secondary Completion Rate (%)",cat:"Attainment",fmt:"pct",api:"worldbank"},
      {code:"SE.XPD.TOTL.GD.ZS",name:"Education Expenditure % GDP",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"SE.XPD.TOTL.GB.ZS",name:"Education Expenditure % Govt Spending",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"SE.ENR.PRSC.FM.ZS",name:"Gender Parity Index — Primary",cat:"Gender",fmt:"num",api:"worldbank"},
      {code:"SE.ENR.SECO.FM.ZS",name:"Gender Parity Index — Secondary",cat:"Gender",fmt:"num",api:"worldbank"},
    ]
  },
  {
    id:"environment", name:"Climate & Environment", short:"ENV", region:"Global", color:"#00c9a7",
    desc:"Environmental indicators from World Bank, UN Environment and climate databases.",
    url:"https://data.worldbank.org/topic/environment", keyRequired:false,
    vars:[
      {code:"EN.ATM.CO2E.PC",name:"CO2 Emissions per Capita (metric tons)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EN.ATM.CO2E.KT",name:"Total CO2 Emissions (kilotons)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EN.ATM.CO2E.GF.ZS",name:"CO2 from Gaseous Fuel (%)",cat:"Emissions",fmt:"pct",api:"worldbank"},
      {code:"EN.ATM.METH.KT.CE",name:"Methane Emissions (kt CO2 equivalent)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EG.USE.PCAP.KG.OE",name:"Energy Use per Capita (kg oil equivalent)",cat:"Energy",fmt:"num",api:"worldbank"},
      {code:"EG.ELC.ACCS.ZS",name:"Access to Electricity (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"EG.FEC.RNEW.ZS",name:"Renewable Energy Consumption (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"EG.ELC.RNEW.ZS",name:"Renewable Electricity Output (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"ER.LND.PTLD.ZS",name:"Terrestrial Protected Areas (% land)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.FRST.ZS",name:"Forest Area (% of land area)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.AGRI.ZS",name:"Agricultural Land (% of land)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"SH.H2O.BASW.ZS",name:"Access to Basic Drinking Water (%)",cat:"Water",fmt:"pct",api:"worldbank"},
      {code:"ER.H2O.FWTL.ZS",name:"Freshwater Withdrawals % of Resources",cat:"Water",fmt:"pct",api:"worldbank"},
    ]
  },
];

const ALL_SOURCES = { macro: MACRO_SOURCES, micro: MICRO_SOURCES };

// ══════════════════════════════════════════════
// FETCH FUNCTIONS
// ══════════════════════════════════════════════

const fetchWorldBank = async (cc, code, y0, y1) => {
  try {
    const r = await fetch(`https://api.worldbank.org/v2/country/${cc}/indicator/${code}?format=json&date=${y0}:${y1}&per_page=100`);
    const j = await r.json();
    if (!j?.[1]) return [];
    return j[1].filter(d => d.value != null)
      .map(d => ({year: parseInt(d.date), value: parseFloat(d.value)}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchIMF = async (cc, code, y0, y1) => {
  try {
    const iso3 = ISO3[cc] || cc;
    const r = await fetch(`https://www.imf.org/external/datamapper/api/v1/${code}/${iso3}`);
    const j = await r.json();
    const data = j?.values?.[code]?.[iso3];
    if (!data) return [];
    return Object.entries(data)
      .filter(([y, v]) => +y >= y0 && +y <= y1 && v != null)
      .map(([y, v]) => ({year: parseInt(y), value: parseFloat(v)}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchFRED = async (code, y0, y1, key) => {
  if (!key) return [];
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${key}&file_type=json&observation_start=${y0}-01-01&observation_end=${y1}-12-31&frequency=a&aggregation_method=avg`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j?.observations) return [];
    return j.observations
      .filter(o => o.value !== '.' && o.value != null)
      .map(o => ({year: parseInt(o.date.substring(0, 4)), value: parseFloat(o.value)}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchWHO = async (cc, code, y0, y1) => {
  try {
    const iso3 = ISO3[cc] || cc;
    const url = `https://ghoapi.azureedge.net/api/${code}?$filter=SpatialDim eq '${iso3}' and TimeDim ge ${y0} and TimeDim le ${y1}&$select=TimeDim,NumericValue&$orderby=TimeDim`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j?.value) return [];
    return j.value
      .filter(d => d.NumericValue != null)
      .map(d => ({year: d.TimeDim, value: d.NumericValue}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchData = async (sourceId, varDef, cc, y0, y1, apiKeys) => {
  const api = varDef.api || sourceId;
  switch (api) {
    case "worldbank": return fetchWorldBank(cc, varDef.wbCode || varDef.code, y0, y1);
    case "imf":       return fetchIMF(cc, varDef.code, y0, y1);
    case "fred":      return fetchFRED(varDef.code, y0, y1, apiKeys.fred);
    case "who":       return fetchWHO(cc, varDef.code, y0, y1);
    default:
      if (["worldbank","bog","bis","unctad","wbpov","ilo","unesco","environment"].includes(sourceId))
        return fetchWorldBank(cc, varDef.wbCode || varDef.code, y0, y1);
      if (sourceId === "imf") return fetchIMF(cc, varDef.code, y0, y1);
      if (sourceId === "fred") return fetchFRED(varDef.code, y0, y1, apiKeys.fred);
      if (sourceId === "who")  return fetchWHO(cc, varDef.code, y0, y1);
      return [];
  }
};

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════

const fmtVal = (v, fmt) => {
  if (v == null || isNaN(v)) return "—";
  if (fmt === "currency") {
    if (Math.abs(v) >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
    if (Math.abs(v) >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6)  return `$${(v/1e6).toFixed(2)}M`;
    return `$${Number(v).toLocaleString()}`;
  }
  if (fmt === "pct") return `${Number(v).toFixed(2)}%`;
  if (fmt === "num") {
    if (Math.abs(v) >= 1e9) return `${(v/1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v/1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `${(v/1e3).toFixed(1)}K`;
    return Number(v).toFixed(2);
  }
  return String(v);
};

const dlCSV = (rows, name) => {
  if (!rows.length) return;
  const h = Object.keys(rows[0]).join(",");
  const b = rows.map(r => Object.values(r).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([h + "\n" + b], {type:"text/csv"}));
  a.download = name; a.click();
};

// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════

const inp = {background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,fontFamily:C.mono,outline:"none",boxSizing:"border-box",width:"100%"};
const sel = {...inp, cursor:"pointer"};
const pill = (active, col=C.gold) => ({padding:"4px 11px",borderRadius:20,border:"1px solid",borderColor:active?col:C.border,background:active?`${col}1a`:"transparent",color:active?col:C.mid,fontSize:10,cursor:"pointer",fontFamily:C.mono,transition:"all .15s",whiteSpace:"nowrap"});
const btn = (col=C.gold) => ({background:col,color:col===C.gold?"#000":"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:12,fontWeight:700,fontFamily:C.font,cursor:"pointer",letterSpacing:"0.04em"});
const card = {background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 22px"};

// ══════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════

function Login({onLogin}) {
  const [mode,setMode]=useState("login");
  const [u,setU]=useState(""); const [email,setEmail]=useState(""); const [p,setP]=useState(""); const [p2,setP2]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false); const [ok,setOk]=useState("");
  const initials=u.trim()?u.trim().slice(0,2).toUpperCase():"◈";
  const avatarColor=["#f0a500","#00c9a7","#4f8cff","#b05cff","#ff4c6a"][u.charCodeAt(0)%5||0];
  const go=async e=>{
    e.preventDefault(); setErr("");
    if(mode==="forgot"){if(!email.trim()){setErr("Email required");return;}setLoading(true);await new Promise(r=>setTimeout(r,900));setLoading(false);setOk("Reset link sent (demo).");return;}
    if(mode==="register"){if(!u.trim()||!email.trim()||!p.trim()){setErr("All fields required");return;}if(p!==p2){setErr("Passwords do not match");return;}if(p.length<6){setErr("Min 6 characters");return;}}
    else{if(!u.trim()||!p.trim()){setErr("Username and password required");return;}}
    setLoading(true);await new Promise(r=>setTimeout(r,900));setLoading(false);
    onLogin({username:u,email:email||`${u}@ecoscope.demo`,initials,avatarColor,
      settings:{defaultCountry:"GH",fredKey:"",anthropicKey:"",defaultSource:"worldbank",defaultLevel:"macro",chartType:"area",startYear:2000,endYear:2023}});
  };
  const Tab=({id,label})=>(<button onClick={()=>{setMode(id);setErr("");setOk("");}} style={{background:"none",border:"none",padding:"9px 0",fontSize:11,fontFamily:C.mono,cursor:"pointer",color:mode===id?C.gold:C.mid,borderBottom:`2px solid ${mode===id?C.gold:"transparent"}`,transition:"all .15s",letterSpacing:"0.08em",textTransform:"uppercase",flex:1}}>{label}</button>);
  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.font,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${C.border}44 1px,transparent 1px),linear-gradient(90deg,${C.border}44 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:700,height:700,borderRadius:"50%",background:`radial-gradient(circle,${C.gold}0d 0%,transparent 70%)`,top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none"}}/>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:22,padding:"44px 44px 32px",width:430,position:"relative",boxShadow:`0 32px 80px rgba(0,0,0,.6)`}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:54,height:54,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:16,fontSize:24,marginBottom:12,boxShadow:`0 8px 24px ${C.gold}44`}}>◈</div>
          <h1 style={{color:C.text,fontSize:24,fontWeight:800,margin:"0 0 3px",letterSpacing:"-0.5px"}}>EcoScope</h1>
          <p style={{color:C.dim,fontSize:9,margin:0,fontFamily:C.mono,letterSpacing:"0.18em"}}>GLOBAL ECONOMIC INTELLIGENCE PLATFORM</p>
        </div>
        {u.trim()&&mode!=="forgot"&&(
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:avatarColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#000",boxShadow:`0 0 0 3px ${C.surface},0 0 0 5px ${avatarColor}55`}}>{initials}</div>
          </div>
        )}
        {mode!=="forgot"&&(<div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:20}}><Tab id="login" label="Sign In"/><Tab id="register" label="Create Account"/></div>)}
        {ok&&<div style={{background:`${C.teal}15`,border:`1px solid ${C.teal}44`,borderRadius:8,padding:"10px 13px",marginBottom:14,color:C.teal,fontSize:11,fontFamily:C.mono}}>{ok}</div>}
        <form onSubmit={go}>
          {mode==="forgot"?(
            <><div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginBottom:16,lineHeight:1.6}}>Enter your email and we will send a reset link.</div>
            <div style={{marginBottom:16}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Email Address</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div></>
          ):(
            <>
              <div style={{marginBottom:14}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Username</div><input type="text" value={u} onChange={e=>setU(e.target.value)} placeholder="Enter your username" style={{...inp,border:`1px solid ${u?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div>
              {mode==="register"&&<div style={{marginBottom:14}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Email Address</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div>}
              <div style={{marginBottom:mode==="register"?14:6}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Password</div><input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="••••••••" style={{...inp,border:`1px solid ${p?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div>
              {mode==="register"&&<div style={{marginBottom:6}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Confirm Password</div><input type="password" value={p2} onChange={e=>setP2(e.target.value)} placeholder="••••••••" style={{...inp,border:`1px solid ${p2?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div>}
              {mode==="login"&&<div style={{textAlign:"right",marginBottom:16}}><button type="button" onClick={()=>{setMode("forgot");setErr("");setOk("");}} style={{background:"none",border:"none",color:C.blue,fontSize:10,fontFamily:C.mono,cursor:"pointer"}}>Forgot password?</button></div>}
            </>
          )}
          {err&&<p style={{color:C.red,fontSize:11,fontFamily:C.mono,marginBottom:12}}>{err}</p>}
          <button type="submit" disabled={loading||!!ok} style={{...btn(),width:"100%",padding:"13px",fontSize:13,opacity:loading||ok?.6:1,marginTop:4}}>
            {loading?"AUTHENTICATING…":mode==="login"?"SIGN IN →":mode==="register"?"CREATE ACCOUNT →":"SEND RESET LINK →"}
          </button>
        </form>
        {mode==="forgot"&&<button onClick={()=>{setMode("login");setOk("");setErr("");}} style={{background:"none",border:"none",color:C.mid,fontSize:11,fontFamily:C.mono,cursor:"pointer",width:"100%",textAlign:"center",marginTop:14}}>← Back to Sign In</button>}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:20,paddingTop:14,display:"flex",justifyContent:"center",gap:22}}>
          {[["🌍","World Bank"],["📊","IMF"],["🏦","FRED"],["🔬","WHO"]].map(([ic,nm])=>(
            <div key={nm} style={{textAlign:"center"}}><div style={{fontSize:16,marginBottom:2}}>{ic}</div><div style={{color:C.dim,fontSize:8,fontFamily:C.mono}}>{nm}</div></div>
          ))}
        </div>
        <p style={{textAlign:"center",color:C.dim,fontSize:9,marginTop:10,fontFamily:C.mono}}>Demo mode — any credentials accepted</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// SETTINGS MODAL
// ══════════════════════════════════════════════

function Settings({user, settings, onSave, onClose}) {
  const [s,setS]=useState({...settings});
  const [tab,setTab]=useState("account");
  const tabs=[{id:"account",icon:"👤",label:"Account"},{id:"data",icon:"📊",label:"Data Defaults"},{id:"keys",icon:"🔑",label:"API Keys"},{id:"display",icon:"🎨",label:"Display"},{id:"help",icon:"❓",label:"Help & Support"}];
  const Sec=({title,children})=>(<div style={{marginBottom:20}}><div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.13em",textTransform:"uppercase",marginBottom:12,paddingBottom:7,borderBottom:`1px solid ${C.border}`}}>{title}</div>{children}</div>);
  const Field=({label,hint,children})=>(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div style={{color:C.text,fontSize:12,fontWeight:600}}>{label}</div>{hint&&<span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{hint}</span>}</div>{children}</div>);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(8px)"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:18,width:620,maxHeight:"88vh",display:"flex",flexDirection:"column",fontFamily:C.font,boxShadow:`0 32px 80px rgba(0,0,0,.7)`}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
            <div><div style={{fontSize:15,fontWeight:700,color:C.text}}>Settings</div><div style={{fontSize:9,color:C.dim,fontFamily:C.mono}}>EcoScope Preferences</div></div>
          </div>
          <button onClick={onClose} style={{background:`${C.border}`,border:"none",color:C.mid,cursor:"pointer",fontSize:14,width:28,height:28,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Sidebar tabs */}
          <div style={{width:160,background:C.card,borderRight:`1px solid ${C.border}`,padding:"12px 8px",display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:8,border:"none",background:tab===t.id?`${C.gold}15`:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`2px solid ${tab===t.id?C.gold:"transparent"}`,transition:"all .12s"}}>
                <span style={{fontSize:14}}>{t.icon}</span>
                <span style={{color:tab===t.id?C.gold:C.mid,fontSize:12,fontWeight:tab===t.id?600:400}}>{t.label}</span>
              </button>
            ))}
          </div>
          {/* Content */}
          <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
            {tab==="account"&&(
              <>
                <Sec title="Profile">
                  <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:C.card,borderRadius:10,marginBottom:14,border:`1px solid ${C.border}`}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
                    <div><div style={{color:C.text,fontSize:13,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>{user.email||"—"}</div></div>
                  </div>
                </Sec>
                <Sec title="Account Details">
                  <Field label="Display Name"><input value={s.displayName||user.username} onChange={e=>setS(x=>({...x,displayName:e.target.value}))} style={{...inp,fontSize:12}} placeholder="Your display name"/></Field>
                  <Field label="Email Address"><input value={s.emailPref||user.email||""} onChange={e=>setS(x=>({...x,emailPref:e.target.value}))} type="email" style={{...inp,fontSize:12}} placeholder="your@email.com"/></Field>
                </Sec>
                <Sec title="Security">
                  <Field label="Change Password" hint="Demo mode"><input type="password" placeholder="New password (demo only)" style={{...inp,fontSize:12,opacity:.6}} disabled/></Field>
                  <div style={{background:`${C.teal}10`,border:`1px solid ${C.teal}33`,borderRadius:8,padding:"10px 13px"}}>
                    <div style={{color:C.teal,fontSize:11,fontFamily:C.mono}}>✓ Demo mode — credentials are not persisted</div>
                  </div>
                </Sec>
              </>
            )}
            {tab==="data"&&(
              <>
                <Sec title="Data Defaults">
                  <Field label="Default Country"><select value={s.defaultCountry||"GH"} onChange={e=>setS(x=>({...x,defaultCountry:e.target.value}))} style={{...sel,fontSize:12}}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name} ({c.region})</option>)}</select></Field>
                  <Field label="Default Data Level">
                    <div style={{display:"flex",gap:8}}>
                      {["macro","micro"].map(l=>(<button key={l} onClick={()=>setS(x=>({...x,defaultLevel:l}))} style={{...pill(s.defaultLevel===l),flex:1,textAlign:"center",padding:"8px",textTransform:"capitalize",fontSize:11}}>{l==="macro"?"📊 Macro":"🔬 Micro"}</button>))}
                    </div>
                  </Field>
                  <Field label="Default Source">
                    <select value={s.defaultSource||"worldbank"} onChange={e=>setS(x=>({...x,defaultSource:e.target.value}))} style={{...sel,fontSize:12}}>
                      {[...MACRO_SOURCES,...MICRO_SOURCES].map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                </Sec>
                <Sec title="Default Time Range">
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{flex:1}}><Field label="Start Year"><select value={s.startYear||2000} onChange={e=>setS(x=>({...x,startYear:+e.target.value}))} style={{...sel,fontSize:12}}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></Field></div>
                    <div style={{color:C.dim,fontSize:12,fontFamily:C.mono,paddingTop:14}}>→</div>
                    <div style={{flex:1}}><Field label="End Year"><select value={s.endYear||2023} onChange={e=>setS(x=>({...x,endYear:+e.target.value}))} style={{...sel,fontSize:12}}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></Field></div>
                  </div>
                </Sec>
              </>
            )}
            {tab==="keys"&&(
              <>
                <div style={{background:`${C.gold}0e`,border:`1px solid ${C.gold}33`,borderRadius:9,padding:"11px 14px",marginBottom:18}}>
                  <div style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>🔑 Keys are stored in your browser session only and never sent to any third party.</div>
                </div>
                <Sec title="Anthropic Claude API">
                  <Field label="API Key" hint={<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:C.blue,fontFamily:C.mono,fontSize:10}}>Get key ↗</a>}>
                    <input type="password" value={s.anthropicKey||""} onChange={e=>setS(x=>({...x,anthropicKey:e.target.value}))} placeholder="sk-ant-api03-..." style={{...inp,fontSize:12}}/>
                    <p style={{color:s.anthropicKey?C.teal:C.red,fontSize:10,fontFamily:C.mono,marginTop:6,marginBottom:0}}>{s.anthropicKey?"✓ Key entered — AI Insights enabled":"⚠ Required for AI Insights"}</p>
                  </Field>
                </Sec>
                <Sec title="FRED (Federal Reserve)">
                  <Field label="API Key" hint={<a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{color:C.blue,fontFamily:C.mono,fontSize:10}}>Get free key ↗</a>}>
                    <input type="password" value={s.fredKey||""} onChange={e=>setS(x=>({...x,fredKey:e.target.value}))} placeholder="Your FRED API key..." style={{...inp,fontSize:12}}/>
                    <p style={{color:s.fredKey?C.teal:C.red,fontSize:10,fontFamily:C.mono,marginTop:6,marginBottom:0}}>{s.fredKey?"✓ Key entered — Federal Reserve data enabled":"⚠ Required for FRED data source"}</p>
                  </Field>
                </Sec>
                <Sec title="Data Sources — No Key Required">
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {["World Bank","IMF WEO","WHO GHO","ILO STAT","UNESCO UIS","UNCTAD","BIS","UN Environment"].map(s=>(<div key={s} style={{background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:6,padding:"5px 10px",color:C.teal,fontSize:10,fontFamily:C.mono}}>✓ {s}</div>))}
                  </div>
                </Sec>
              </>
            )}
            {tab==="display"&&(
              <>
                <Sec title="Chart Preferences">
                  <Field label="Default Chart Type">
                    <div style={{display:"flex",gap:7}}>
                      {[["area","◭ Area"],["line","╱ Line"],["bar","▮ Bar"]].map(([t,l])=>(<button key={t} onClick={()=>setS(x=>({...x,chartType:t}))} style={{...pill(s.chartType===t),flex:1,textAlign:"center",padding:"8px",fontSize:11}}>{l}</button>))}
                    </div>
                  </Field>
                  <Field label="Default View">
                    <div style={{display:"flex",gap:7}}>
                      {[["chart","◫ Chart"],["table","⊞ Table"]].map(([v,l])=>(<button key={v} onClick={()=>setS(x=>({...x,defaultView:v}))} style={{...pill(s.defaultView===v),flex:1,textAlign:"center",padding:"8px",fontSize:11}}>{l}</button>))}
                    </div>
                  </Field>
                </Sec>
                <Sec title="Interface">
                  <Field label="Sidebar Width"><select value={s.sidebarWidth||268} onChange={e=>setS(x=>({...x,sidebarWidth:+e.target.value}))} style={{...sel,fontSize:12}}><option value={230}>Compact (230px)</option><option value={268}>Default (268px)</option><option value={320}>Wide (320px)</option></select></Field>
                  <div style={{background:`${C.border}`,borderRadius:8,padding:"10px 13px"}}>
                    <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>More theme options coming soon.</div>
                  </div>
                </Sec>
              </>
            )}
            {tab==="help"&&(
              <>
                <Sec title="Documentation & Links">
                  {[{icon:"🌍",name:"World Bank Open Data",url:"https://data.worldbank.org",desc:"1,400+ global indicators"},
                    {icon:"📊",name:"IMF Data Mapper",url:"https://www.imf.org/external/datamapper",desc:"Macro projections & history"},
                    {icon:"🏦",name:"FRED Economic Data",url:"https://fred.stlouisfed.org",desc:"800K+ US & global series"},
                    {icon:"🔬",name:"WHO Global Health Observatory",url:"https://www.who.int/data/gho",desc:"Global health statistics"},
                    {icon:"💼",name:"ILO STAT",url:"https://ilostat.ilo.org",desc:"Labour market data"},
                    {icon:"🎓",name:"UNESCO UIS",url:"https://uis.unesco.org",desc:"Education statistics"},
                    {icon:"🏛",name:"Bank of Ghana",url:"https://www.bog.gov.gh/economic-data/",desc:"Ghana monetary data"},
                  ].map(r=>(<a key={r.name} href={r.url} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 13px",background:C.card,borderRadius:9,marginBottom:8,border:`1px solid ${C.border}`,textDecoration:"none",transition:"border-color .15s"}}>
                    <span style={{fontSize:20}}>{r.icon}</span>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:600}}>{r.name}</div><div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{r.desc}</div></div>
                    <span style={{marginLeft:"auto",color:C.dim,fontSize:11}}>↗</span>
                  </a>))}
                </Sec>
                <Sec title="About EcoScope">
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"13px 15px"}}>
                    <div style={{color:C.text,fontSize:12,marginBottom:4,fontWeight:600}}>EcoScope v2.0</div>
                    <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,lineHeight:1.7}}>Global Economic Intelligence Platform. Data from World Bank, IMF, FRED, WHO, ILO, UNESCO, Bank of Ghana, BIS and UNCTAD. AI insights powered by Claude (Anthropic).</div>
                  </div>
                </Sec>
              </>
            )}
          </div>
        </div>
        {/* Footer */}
        <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 24px",display:"flex",justifyContent:"flex-end",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 18px",color:C.mid,fontSize:12,cursor:"pointer",fontFamily:C.font}}>Cancel</button>
          <button onClick={()=>{onSave(s);onClose();}} style={{...btn(),padding:"9px 24px",fontSize:12}}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════════

const CustomTip = ({active,payload,label,fmt}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
      <div style={{color:C.mid,marginBottom:6}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.stroke||p.fill||C.gold,display:"flex",gap:12,justifyContent:"space-between"}}>
          <span>{p.name}</span><span style={{fontWeight:600}}>{fmtVal(p.value,fmt)}</span>
        </div>
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════

function Dashboard({user, onLogout}) {
  const [settings,setSettings]=useState(user.settings||{defaultCountry:"GH",fredKey:"",anthropicKey:""});
  const [showSettings,setShowSettings]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);

  // Source
  const [dataLevel,setDataLevel]=useState("macro");
  const [sourceId,setSourceId]=useState("worldbank");

  // Variable
  const [varCode,setVarCode]=useState("NY.GDP.MKTP.CD");
  const [varSearch,setVarSearch]=useState("");

  // Country
  const [country,setCountry]=useState(settings.defaultCountry||"GH");
  const [regionFilter,setRegionFilter]=useState("Africa");
  const [countrySearch,setCountrySearch]=useState("");

  // Time
  const [startYear,setStartYear]=useState(2000);
  const [endYear,setEndYear]=useState(2023);

  // Chart
  const [chartType,setChartType]=useState("area");
  const [viewMode,setViewMode]=useState("chart");

  // Compare
  const [cmpOn,setCmpOn]=useState(false);
  const [cmpCountry,setCmpCountry]=useState("NG");

  // Data
  const [data,setData]=useState([]);
  const [cmpData,setCmpData]=useState([]);
  const [loading,setLoading]=useState(false);

  // AI
  const [insight,setInsight]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState("");

  // Derived
  const sources = dataLevel==="macro" ? MACRO_SOURCES : MICRO_SOURCES;
  const source  = sources.find(s=>s.id===sourceId)||sources[0];
  const effCountry = source.countryFixed||country;
  const cc  = COUNTRIES.find(x=>x.code===effCountry)||COUNTRIES[0];
  const cmpC = COUNTRIES.find(x=>x.code===cmpCountry)||COUNTRIES[1];

  const filteredVars = useMemo(()=>{
    const q=varSearch.toLowerCase();
    return source.vars.filter(v=>!q||v.name.toLowerCase().includes(q)||v.cat.toLowerCase().includes(q)||v.code.toLowerCase().includes(q));
  },[source,varSearch]);

  const groupedVars = useMemo(()=>{
    const g={};
    filteredVars.forEach(v=>{if(!g[v.cat])g[v.cat]=[];g[v.cat].push(v);});
    return g;
  },[filteredVars]);

  const currentVar = source.vars.find(v=>v.code===varCode)||source.vars[0];

  const filteredCountries = COUNTRIES.filter(c=>{
    const rOk=regionFilter==="All"||c.region===regionFilter;
    const sOk=!countrySearch||c.name.toLowerCase().includes(countrySearch.toLowerCase())||c.code.toLowerCase().includes(countrySearch.toLowerCase());
    return rOk&&sOk;
  });

  // Reset var when source changes
  useEffect(()=>{
    if (!source.vars.find(v=>v.code===varCode)) setVarCode(source.vars[0].code);
  },[sourceId]);

  // Reset source when level changes
  useEffect(()=>{
    const srcs=dataLevel==="macro"?MACRO_SOURCES:MICRO_SOURCES;
    setSourceId(srcs[0].id);
    setVarCode(srcs[0].vars[0].code);
    setVarSearch("");
  },[dataLevel]);

  // Load data
  const loadData = useCallback(async()=>{
    setLoading(true);
    const apiKeys={fred:settings.fredKey||"",anthropic:settings.anthropicKey||""};
    const d=await fetchData(source.id,currentVar,effCountry,startYear,endYear,apiKeys);
    setData(d);
    if (cmpOn&&!source.countryFixed) {
      const cd=await fetchData(source.id,currentVar,cmpCountry,startYear,endYear,apiKeys);
      setCmpData(cd);
    } else setCmpData([]);
    setLoading(false);
  },[source,currentVar,effCountry,startYear,endYear,cmpOn,cmpCountry,settings]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{setInsight("");setAiError("");},[sourceId,varCode,effCountry,startYear,endYear]);

  // Chart merge
  const chartData = data.map(d=>{
    const row={year:d.year,[cc.name]:d.value};
    if (cmpOn&&!source.countryFixed) {
      const x=cmpData.find(z=>z.year===d.year);
      if (x) row[cmpC.name]=x.value;
    }
    return row;
  });

  const latest=data.length?data[data.length-1]:null;
  const prev=data.length>1?data[data.length-2]:null;
  const chg=latest&&prev&&prev.value?((latest.value-prev.value)/Math.abs(prev.value)*100):null;

  const kpis=[
    {lbl:"Source",     val:source.short,            sub:source.name.split("—")[0].trim()},
    {lbl:"Country",    val:`${cc.flag} ${cc.name}`, sub:cc.region},
    {lbl:"Indicator",  val:currentVar.name.split("(")[0].trim().substring(0,22), sub:currentVar.cat},
    {lbl:"Latest",     val:latest?fmtVal(latest.value,currentVar.fmt):"—", sub:latest?`year ${latest.year}`:"No data"},
    {lbl:"YoY Change", val:chg!=null?`${chg>=0?"+":""}${chg.toFixed(1)}%`:"—", sub:"vs previous year", pos:chg>0,neg:chg<0&&chg!=null},
  ];

  const renderChart=()=>{
    const keys=[cc.name,(cmpOn&&!source.countryFixed)?cmpC.name:null].filter(Boolean);
    const ax={
      x:<XAxis dataKey="year" tick={{fill:C.mid,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:C.border}} tickLine={false}/>,
      y:<YAxis tick={{fill:C.mid,fontSize:10,fontFamily:C.mono}} axisLine={false} tickLine={false} tickFormatter={v=>fmtVal(v,currentVar.fmt)} width={74}/>,
      g:<CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false}/>,
      t:<Tooltip content={<CustomTip fmt={currentVar.fmt}/>}/>,
      l:<Legend wrapperStyle={{color:C.mid,fontSize:11,fontFamily:C.mono}}/>,
    };
    if (chartType==="bar") return <BarChart data={chartData} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{keys.map((k,i)=><Bar key={k} dataKey={k} fill={ACCENT[i]} radius={[4,4,0,0]}/>)}</BarChart>;
    if (chartType==="area") return (
      <AreaChart data={chartData} margin={{top:10,right:16,left:0,bottom:0}}>
        <defs>{keys.map((k,i)=><linearGradient key={k} id={`g${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT[i]} stopOpacity={.3}/><stop offset="95%" stopColor={ACCENT[i]} stopOpacity={0}/></linearGradient>)}</defs>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}
        {keys.map((k,i)=><Area key={k} dataKey={k} stroke={ACCENT[i]} fill={`url(#g${i})`} strokeWidth={2.5} dot={false}/>)}
      </AreaChart>
    );
    return <LineChart data={chartData} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{keys.map((k,i)=><Line key={k} dataKey={k} stroke={ACCENT[i]} strokeWidth={2.5} dot={false} activeDot={{r:5}}/>)}</LineChart>;
  };

  // AI Insight
  const getInsight=async()=>{
    if (!data.length) return;
    const key=settings.anthropicKey;
    if (!key){setAiError("Add your Anthropic API key in ⚙ Settings to enable AI insights.");return;}
    setAiLoading(true);setInsight("");setAiError("");
    try {
      const summary=data.slice(-15).map(d=>`${d.year}:${fmtVal(d.value,currentVar.fmt)}`).join(", ");
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`You are an expert economic and financial data analyst. Analyze the indicator "${currentVar.name}" for ${cc.name}, data from ${source.name}, covering ${startYear}–${endYear}.\n\nData points: ${summary}\n\nProvide a concise, insightful analysis in exactly 3 paragraphs (max 220 words total):\n1. Key trend: What the data shows — direction, magnitude, turning points\n2. Context: Historical events, policy decisions, or structural factors that explain the pattern\n3. Outlook: Implications and what to watch for going forward\n\nBe specific, factual and data-driven. Reference actual numbers from the data.`}]
        })
      });
      const j=await res.json();
      if (j.error) throw new Error(j.error.message||"API error");
      setInsight(j.content?.[0]?.text||"Analysis unavailable.");
    } catch(e) {
      if (e.message.includes("Failed to fetch")||e.message.includes("NetworkError")) {
        setAiError("Network error — check your internet connection and that your API key is correct.");
      } else {
        setAiError(`Error: ${e.message}`);
      }
    }
    setAiLoading(false);
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:C.font,color:C.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>

      {/* HEADER */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.14em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          <div style={{fontSize:10,color:C.dim,fontFamily:C.mono}}>{source.short} · {cc.flag} {cc.name} · {currentVar.name.substring(0,30)} · {startYear}–{endYear}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {/* User avatar button */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:20,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
              <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{color:C.mid,fontSize:8,marginLeft:2}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:13,padding:"6px",minWidth:220,boxShadow:`0 16px 48px rgba(0,0,0,.7)`,zIndex:200}}>
                {/* Signed in as */}
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{user.email||"demo@ecoscope.app"}</div></div>
                  </div>
                </div>
                {/* Menu items */}
                {[
                  {icon:"⚙",label:"Settings",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  {icon:"📊",label:"Data Sources",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  {icon:"🔑",label:"API Keys",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  {icon:"❓",label:"Help & Support",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=> item===null
                  ? <div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  : <button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left",transition:"background .1s",color:item.danger?C.red:C.text}}>
                      <span style={{fontSize:13,width:18,textAlign:"center"}}>{item.icon}</span>
                      <span style={{fontSize:12,fontFamily:C.font,fontWeight:500}}>{item.label}</span>
                    </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* SIDEBAR */}
        <aside style={{width:268,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflowY:"auto",flexShrink:0}}>

          {/* DATA LEVEL TOGGLE */}
          <div style={{padding:"12px 10px 6px"}}>
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Data Level</div>
            <div style={{display:"flex",gap:5}}>
              {["macro","micro"].map(lvl=>(
                <button key={lvl} onClick={()=>setDataLevel(lvl)} style={{...pill(dataLevel===lvl),flex:1,textAlign:"center",textTransform:"capitalize",fontSize:11,padding:"6px 0"}}>
                  {lvl==="macro"?"📊 Macro":"🔬 Micro"}
                </button>
              ))}
            </div>
          </div>

          {/* SOURCE SELECTOR */}
          <div style={{padding:"6px 10px 10px"}}>
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Data Source</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {sources.map(s=>(
                <button key={s.id} onClick={()=>setSourceId(s.id)} style={{
                  ...pill(sourceId===s.id,s.color),
                  fontSize:10,padding:"4px 9px",
                }}>
                  {s.short}
                </button>
              ))}
            </div>
            {source.note && <p style={{color:C.dim,fontSize:9,fontFamily:C.mono,margin:"7px 0 0",lineHeight:1.5}}>{source.note}</p>}
            {source.keyRequired&&!settings.fredKey&&(
              <div style={{background:`${C.red}15`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"6px 9px",marginTop:7}}>
                <p style={{color:C.red,fontSize:9,fontFamily:C.mono,margin:0}}>⚠ API key required. Add in ⚙ Settings.</p>
              </div>
            )}
          </div>

          {/* VARIABLE SEARCH + LIST */}
          <div style={{flex:"0 0 auto",maxHeight:"34%",display:"flex",flexDirection:"column",borderTop:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"9px 10px 6px",flexShrink:0}}>
              <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Variable <span style={{color:C.dim}}>({source.vars.length} available)</span></div>
              <input value={varSearch} onChange={e=>setVarSearch(e.target.value)} placeholder="🔍 Search variables..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
            </div>
            <div style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
              {Object.entries(groupedVars).map(([cat,vars])=>(
                <div key={cat}>
                  <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",padding:"6px 6px 3px"}}>{cat}</div>
                  {vars.map(v=>{
                    const active=varCode===v.code;
                    return(
                      <button key={v.code} onClick={()=>setVarCode(v.code)} style={{width:"100%",display:"block",padding:"6px 10px",borderRadius:6,border:"none",borderLeft:`2px solid ${active?source.color:"transparent"}`,background:active?`${source.color}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                        <div style={{color:active?source.color:C.text,fontSize:11,lineHeight:1.3}}>{v.name}</div>
                        <div style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>{v.fmt}</div>
                      </button>
                    );
                  })}
                </div>
              ))}
              {Object.keys(groupedVars).length===0&&<p style={{color:C.dim,fontSize:11,fontFamily:C.mono,padding:"8px 6px"}}>No variables match "{varSearch}"</p>}
            </div>
          </div>

          {/* COUNTRY SELECTOR */}
          {!source.countryFixed && (
            <div style={{flex:"0 0 auto",maxHeight:"32%",display:"flex",flexDirection:"column",borderTop:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{padding:"9px 10px 6px",flexShrink:0}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Country</div>
                <input value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} placeholder="🔍 Search countries..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:6}}>
                  {["All","Africa","Americas","Europe","Asia","Middle East","Oceania"].map(r=>(
                    <button key={r} onClick={()=>setRegionFilter(r)} style={{...pill(regionFilter===r),fontSize:8,padding:"2px 7px"}}>{r}</button>
                  ))}
                </div>
              </div>
              <div style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,padding:"3px 6px 4px"}}>{filteredCountries.length} countr{filteredCountries.length===1?"y":"ies"}</div>
                {filteredCountries.map(c=>{
                  const active=country===c.code;
                  return(
                    <button key={c.code} onClick={()=>setCountry(c.code)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,border:"none",borderLeft:`2px solid ${active?C.gold:"transparent"}`,background:active?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                      <span style={{fontSize:15,lineHeight:1}}>{c.flag}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:active?C.gold:C.text,fontSize:11,fontWeight:active?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                        <div style={{color:C.dim,fontSize:8,fontFamily:C.mono}}>{c.code}</div>
                      </div>
                      {c.star&&<span style={{fontSize:7,background:C.gold,color:"#000",borderRadius:3,padding:"1px 4px",fontWeight:800,fontFamily:C.mono}}>★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {source.countryFixed && (
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Country (Fixed)</div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:`${source.color}12`,border:`1px solid ${source.color}44`,borderRadius:7}}>
                <span style={{fontSize:17}}>{cc.flag}</span>
                <span style={{color:source.color,fontSize:12,fontWeight:600}}>{cc.name}</span>
              </div>
            </div>
          )}

          {/* YEAR RANGE */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Year Range</div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <select value={startYear} onChange={e=>setStartYear(+e.target.value)} style={{...sel,padding:"6px 7px",fontSize:11,flex:1}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>→</span>
              <select value={endYear} onChange={e=>setEndYear(+e.target.value)} style={{...sel,padding:"6px 7px",fontSize:11,flex:1}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* COMPARE */}
          {!source.countryFixed && (
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:cmpOn?9:0}}>
                <input type="checkbox" checked={cmpOn} onChange={e=>setCmpOn(e.target.checked)} style={{accentColor:C.gold,width:13,height:13}}/>
                <span style={{color:cmpOn?C.text:C.mid,fontSize:12,fontWeight:cmpOn?600:400}}>Compare Countries</span>
              </label>
              {cmpOn&&(
                <select value={cmpCountry} onChange={e=>setCmpCountry(e.target.value)} style={{...sel,padding:"6px 9px",fontSize:11}}>
                  {COUNTRIES.filter(c=>c.code!==country).map(c=><option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              )}
            </div>
          )}
        </aside>

        {/* MAIN CONTENT */}
        <main style={{flex:1,overflowY:"auto",padding:18,display:"flex",flexDirection:"column",gap:16}}>

          {/* Source info banner */}
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",background:`${source.color}0f`,border:`1px solid ${source.color}33`,borderRadius:9}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:source.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{color:source.color,fontWeight:700,fontSize:12}}>{source.name}</span>
              <span style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginLeft:10}}>{source.desc}</span>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer" style={{color:source.color,fontSize:10,fontFamily:C.mono,textDecoration:"none"}}>Visit ↗</a>
          </div>

          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:11}}>
            {kpis.map((k,i)=>(
              <div key={i} style={{...card,padding:"13px 16px"}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>{k.lbl}</div>
                <div style={{fontSize:16,fontWeight:700,color:k.pos?C.teal:k.neg?C.red:C.text,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={k.val}>{k.val}</div>
                <div style={{fontSize:9,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{...card,padding:"20px 22px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div>
                <h2 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>{currentVar.name}</h2>
                <p style={{margin:"4px 0 0",fontSize:10,color:C.mid,fontFamily:C.mono}}>
                  {source.short} · {cc.flag} {cc.name}{cmpOn&&!source.countryFixed?` vs ${cmpC.flag} ${cmpC.name}`:""} · {startYear}–{endYear}
                </p>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {["area","line","bar"].map(t=>(
                  <button key={t} onClick={()=>setChartType(t)} style={{...pill(chartType===t),textTransform:"capitalize"}}>
                    {t==="area"?"◭":t==="line"?"╱":"▮"} {t}
                  </button>
                ))}
                <div style={{width:1,height:16,background:C.border}}/>
                <button onClick={()=>setViewMode(v=>v==="chart"?"table":"chart")} style={pill(false)}>
                  {viewMode==="chart"?"⊞ Table":"◫ Chart"}
                </button>
                <button onClick={()=>dlCSV(data.map(d=>({year:d.year,[currentVar.name]:d.value})),`${cc.name}_${currentVar.name}_${startYear}_${endYear}.csv`)} style={{...pill(false),color:C.teal,borderColor:`${C.teal}55`}}>
                  ↓ CSV
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{height:300,display:"flex",alignItems:"center",justifyContent:"center",color:C.mid,fontFamily:C.mono,fontSize:12,gap:10}}>
                <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Fetching from {source.name}…
              </div>
            ) : !data.length ? (
              <div style={{height:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono,fontSize:12,gap:8}}>
                <span style={{fontSize:30}}>◌</span>
                <span>No data available for this selection</span>
                {source.keyRequired&&!settings.fredKey&&<span style={{color:C.red,fontSize:11}}>⚠ FRED API key required — add in Settings</span>}
              </div>
            ) : viewMode==="chart" ? (
              <ResponsiveContainer width="100%" height={300}>{renderChart()}</ResponsiveContainer>
            ) : (
              <div style={{maxHeight:300,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr>
                      {["Year",cc.name,(cmpOn&&!source.countryFixed)?cmpC.name:null,"Δ YoY"].filter(Boolean).map(h=>(
                        <th key={h} style={{color:C.dim,padding:"7px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:500,textAlign:h==="Year"?"left":"right",textTransform:"uppercase",fontSize:9,letterSpacing:"0.1em"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d,i)=>{
                      const cd=(cmpOn&&!source.countryFixed)?cmpData.find(z=>z.year===d.year):null;
                      const prv=data[i-1];
                      const delta=prv&&prv.value?((d.value-prv.value)/Math.abs(prv.value)*100):null;
                      return(
                        <tr key={d.year} style={{background:i%2?`${C.surface}88`:"transparent"}}>
                          <td style={{color:C.mid,padding:"6px 12px"}}>{d.year}</td>
                          <td style={{color:C.gold,textAlign:"right",padding:"6px 12px",fontWeight:600}}>{fmtVal(d.value,currentVar.fmt)}</td>
                          {cmpOn&&!source.countryFixed&&<td style={{color:C.teal,textAlign:"right",padding:"6px 12px"}}>{cd?fmtVal(cd.value,currentVar.fmt):"—"}</td>}
                          <td style={{color:delta==null?C.dim:delta>=0?C.teal:C.red,textAlign:"right",padding:"6px 12px"}}>
                            {delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI INSIGHT */}
          <div style={{...card}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:22,height:22,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>◈</div>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>AI Economic Insight</h3>
                </div>
                <p style={{margin:0,fontSize:10,color:C.mid,fontFamily:C.mono}}>Powered by Claude · {source.short} · {cc.flag} {cc.name} · {currentVar.name.substring(0,40)}</p>
              </div>
              <button onClick={getInsight} disabled={aiLoading||!data.length} style={{...btn(C.gold),opacity:aiLoading||!data.length?.5:1,cursor:aiLoading||!data.length?"not-allowed":"pointer",fontSize:11,padding:"9px 18px"}}>
                {aiLoading?"◌ Analysing…":"✦ Generate Insight"}
              </button>
            </div>
            {aiError&&(
              <div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:8,padding:"12px 14px",marginTop:14}}>
                <p style={{color:C.red,fontSize:11,fontFamily:C.mono,margin:0}}>{aiError}</p>
              </div>
            )}
            {insight&&(
              <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:9,padding:"14px 16px",marginTop:14}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Analysis — {source.name} · {cc.name} · {currentVar.name}</div>
                <p style={{color:C.text,fontSize:12.5,lineHeight:1.85,margin:0,fontFamily:C.mono,whiteSpace:"pre-wrap"}}>{insight}</p>
              </div>
            )}
            {!insight&&!aiLoading&&!aiError&&(
              <p style={{color:C.dim,fontSize:11,fontFamily:C.mono,marginTop:12,marginBottom:0}}>
                Click "Generate Insight" for an AI-powered analysis of the selected data. Requires Anthropic API key in ⚙ Settings.
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>Sources: World Bank · IMF · FRED · WHO GHO · Bank of Ghana · BIS · UNCTAD · ILO · UNESCO · UN Environment</span>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>EcoScope v2.0 · {new Date().getFullYear()}</span>
          </div>
        </main>
      </div>

      {showSettings&&<Settings user={user} settings={settings} onSave={ns=>setSettings(ns)} onClose={()=>setShowSettings(false)}/>}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        ::-webkit-scrollbar-thumb:hover{background:${C.gold}55;}
        select option{background:${C.card};color:${C.text};}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        a{text-decoration:none;}
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════

export default function App() {
  const [user,setUser]=useState(null);
  if (!user) return <Login onLogin={setUser}/>;
  if (user.username==="admin"||user.role==="admin") return <AdminPanel user={user} onLogout={()=>setUser(null)}/>;
  return <Dashboard user={user} onLogout={()=>setUser(null)}/>;
}

// ══════════════════════════════════════════════
// MOCK DATA FOR ADMIN
// ══════════════════════════════════════════════
const MOCK_USERS = [
  {id:1,username:"gbrucenyarkoh",email:"gbrucenyarkoh@gmail.com",role:"admin",status:"active",joined:"2024-01-15",lastSeen:"Today",queries:342,fredKey:true,anthropicKey:true,country:"GH"},
  {id:2,username:"analyst_kwame",email:"kwame.asante@gmail.com",role:"analyst",status:"active",joined:"2024-02-03",lastSeen:"Today",queries:118,fredKey:false,anthropicKey:true,country:"GH"},
  {id:3,username:"ama_ekonomist",email:"ama.owusu@ug.edu.gh",role:"user",status:"active",joined:"2024-02-20",lastSeen:"Yesterday",queries:87,fredKey:false,anthropicKey:false,country:"GH"},
  {id:4,username:"imf_researcher",email:"research@imf.org",role:"analyst",status:"active",joined:"2024-03-01",lastSeen:"2 days ago",queries:204,fredKey:true,anthropicKey:true,country:"US"},
  {id:5,username:"worldbank_dev",email:"data@worldbank.org",role:"user",status:"inactive",joined:"2024-03-10",lastSeen:"1 week ago",queries:56,fredKey:false,anthropicKey:false,country:"US"},
  {id:6,username:"kojo_stats",email:"kojo@statsghana.gov.gh",role:"user",status:"active",joined:"2024-04-05",lastSeen:"3 days ago",queries:33,fredKey:false,anthropicKey:false,country:"GH"},
];
const MOCK_ACTIVITY = [
  {time:"09:14",user:"gbrucenyarkoh",action:"Generated AI Insight",detail:"Ghana GDP Growth — World Bank (2000–2023)"},
  {time:"09:07",user:"analyst_kwame",action:"Downloaded CSV",detail:"Nigeria Inflation CPI — IMF (2010–2023)"},
  {time:"08:55",user:"ama_ekonomist",action:"Compared Countries",detail:"Ghana vs Nigeria — FDI Inflows (World Bank)"},
  {time:"08:30",user:"imf_researcher",action:"Generated AI Insight",detail:"US Federal Funds Rate — FRED (1990–2023)"},
  {time:"08:22",user:"gbrucenyarkoh",action:"Switched Source",detail:"UNCTAD → World Bank — Trade Openness"},
  {time:"07:58",user:"kojo_stats",action:"Login",detail:"New session started"},
  {time:"07:44",user:"analyst_kwame",action:"Generated AI Insight",detail:"South Africa Unemployment — ILO (2005–2023)"},
  {time:"07:30",user:"imf_researcher",action:"Downloaded CSV",detail:"US GDP — FRED (1970–2023)"},
];
const SOURCE_STATUS = [
  {name:"World Bank",short:"WB",url:"https://api.worldbank.org/v2/country/GH/indicator/NY.GDP.MKTP.CD?format=json",status:"live",latency:"210ms",uptime:"99.9%",color:"#4f8cff"},
  {name:"IMF DataMapper",short:"IMF",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/GHA",status:"live",latency:"380ms",uptime:"99.4%",color:"#00c9a7"},
  {name:"FRED (St. Louis Fed)",short:"FRED",url:null,status:"key-required",latency:"—",uptime:"99.8%",color:"#ff4c6a"},
  {name:"WHO GHO",short:"WHO",url:"https://ghoapi.azureedge.net/api/WHOSIS_000001?$top=1",status:"live",latency:"290ms",uptime:"98.7%",color:"#b05cff"},
  {name:"Bank of Ghana",short:"BoG",url:null,status:"proxied",latency:"—",uptime:"99.9%",color:"#f0a500"},
  {name:"BIS",short:"BIS",url:null,status:"proxied",latency:"—",uptime:"99.5%",color:"#00d4e8"},
  {name:"UNCTAD",short:"UNCTAD",url:null,status:"proxied",latency:"—",uptime:"99.2%",color:"#ff8c42"},
  {name:"ILO STAT",short:"ILO",url:null,status:"proxied",latency:"—",uptime:"99.1%",color:"#00d4e8"},
  {name:"UNESCO UIS",short:"UIS",url:null,status:"proxied",latency:"—",uptime:"98.9%",color:"#ff8c42"},
  {name:"UN Environment",short:"ENV",url:null,status:"proxied",latency:"—",uptime:"99.0%",color:"#00c9a7"},
];

// ══════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════
function AdminPanel({user, onLogout}) {
  const [tab,setTab]=useState("overview");
  const [showSettings,setShowSettings]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [settings,setSettings]=useState(user.settings||{});
  const [sourceStatuses,setSourceStatuses]=useState(SOURCE_STATUS.map(s=>({...s})));
  const [users,setUsers]=useState(MOCK_USERS);
  const [userSearch,setUserSearch]=useState("");
  const [roleFilter,setRoleFilter]=useState("all");
  const [pingLoading,setPingLoading]=useState({});
  const [selectedUser,setSelectedUser]=useState(null);
  const [notif,setNotif]=useState(null);

  const notify=(msg,type="success")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3000);};

  const pingSource=async(idx)=>{
    const s=sourceStatuses[idx];
    if(!s.url){notify(`${s.name} uses proxied WB/IMF data — no direct endpoint to ping.`,"info");return;}
    setPingLoading(p=>({...p,[idx]:true}));
    const t0=Date.now();
    try{await fetch(s.url,{mode:"cors"});const ms=Date.now()-t0;
      setSourceStatuses(ss=>ss.map((x,i)=>i===idx?{...x,status:"live",latency:`${ms}ms`}:x));
      notify(`${s.name} responded in ${ms}ms ✓`,"success");
    }catch{setSourceStatuses(ss=>ss.map((x,i)=>i===idx?{...x,status:"error"}:x));notify(`${s.name} ping failed`,"error");}
    setPingLoading(p=>({...p,[idx]:false}));
  };

  const totalQueries=users.reduce((a,u)=>a+u.queries,0);
  const activeUsers=users.filter(u=>u.status==="active").length;
  const aiEnabled=users.filter(u=>u.anthropicKey).length;
  const ghanaUsers=users.filter(u=>u.country==="GH").length;

  const filteredUsers=users.filter(u=>{
    const sq=userSearch.toLowerCase();
    const matchSearch=!sq||u.username.toLowerCase().includes(sq)||u.email.toLowerCase().includes(sq);
    const matchRole=roleFilter==="all"||u.role===roleFilter;
    return matchSearch&&matchRole;
  });

  const navItems=[
    {id:"overview",icon:"◈",label:"Overview"},
    {id:"users",icon:"👥",label:"User Management"},
    {id:"sources",icon:"🌐",label:"Data Sources"},
    {id:"activity",icon:"📋",label:"Activity Log"},
    {id:"config",icon:"⚙",label:"System Config"},
  ];

  const statusBadge=(s)=>{
    const map={live:[C.teal,"●"],error:[C.red,"●"],"key-required":[C.gold,"◌"],proxied:[C.blue,"◎"]};
    const [col,ic]=map[s]||[C.dim,"●"];
    return <span style={{color:col,fontSize:9,fontFamily:C.mono}}>{ic} {s}</span>;
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:C.font,color:C.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>

      {/* NOTIFICATION */}
      {notif&&(
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:notif.type==="success"?`${C.teal}18`:notif.type==="error"?`${C.red}18`:`${C.blue}18`,border:`1px solid ${notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue}55`,borderRadius:9,padding:"11px 18px",color:notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue,fontSize:12,fontFamily:C.mono,boxShadow:`0 8px 24px rgba(0,0,0,.5)`}}>
          {notif.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.14em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:8,color:C.gold}}>⬡</span>
            <span style={{color:C.gold,fontSize:10,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.1em"}}>ADMIN PANEL</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",gap:6,fontFamily:C.mono,fontSize:10}}>
            <span style={{color:C.teal}}>● {activeUsers} active</span>
            <span style={{color:C.dim}}>·</span>
            <span style={{color:C.mid}}>{totalQueries} queries today</span>
          </div>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:20,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000"}}>{user.initials||"A"}</div>
              <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{color:C.mid,fontSize:8}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:13,padding:"6px",minWidth:220,boxShadow:`0 16px 48px rgba(0,0,0,.7)`,zIndex:200}}>
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000"}}>{user.initials||"A"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{user.email||"admin@ecoscope.app"}</div></div>
                  </div>
                  <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:"3px 9px",display:"inline-block"}}><span style={{color:C.gold,fontSize:9,fontFamily:C.mono,fontWeight:700}}>⬡ ADMINISTRATOR</span></div>
                </div>
                {[
                  {icon:"◈",label:"Switch to Dashboard",action:()=>{onLogout();},special:true},
                  null,
                  {icon:"⚙",label:"System Config",action:()=>{setTab("config");setShowUserMenu(false);}},
                  {icon:"👥",label:"User Management",action:()=>{setTab("users");setShowUserMenu(false);}},
                  {icon:"🌐",label:"Data Sources",action:()=>{setTab("sources");setShowUserMenu(false);}},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=>item===null
                  ?<div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  :<button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:8,border:"none",background:item.special?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",color:item.danger?C.red:item.special?C.gold:C.text}}>
                    <span style={{fontSize:13,width:18,textAlign:"center"}}>{item.icon}</span>
                    <span style={{fontSize:12,fontFamily:C.font,fontWeight:item.special?700:500}}>{item.label}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ADMIN SIDEBAR NAV */}
        <nav style={{width:200,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,padding:"12px 8px"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,border:"none",background:tab===n.id?`${C.gold}15`:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`2px solid ${tab===n.id?C.gold:"transparent"}`,marginBottom:2,transition:"all .12s"}}>
              <span style={{fontSize:15}}>{n.icon}</span>
              <span style={{color:tab===n.id?C.gold:C.mid,fontSize:12,fontWeight:tab===n.id?700:400}}>{n.label}</span>
            </button>
          ))}
          <div style={{flex:1}}/>
          <button onClick={()=>setTab("overview")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",textAlign:"left",marginTop:8}}>
            <span style={{fontSize:13}}>◫</span>
            <span style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>v2.0 · Admin</span>
          </button>
        </nav>

        {/* MAIN CONTENT */}
        <main style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

          {/* ── OVERVIEW ── */}
          {tab==="overview"&&(
            <>
              <div>
                <h1 style={{fontSize:20,fontWeight:800,color:C.text,margin:"0 0 4px"}}>Welcome back, {user.username} 👋</h1>
                <p style={{color:C.mid,fontSize:11,fontFamily:C.mono,margin:0}}>EcoScope Admin Dashboard · {new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
              </div>
              {/* KPI row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[
                  {icon:"👥",label:"Total Users",val:users.length,sub:`${activeUsers} active`,col:C.blue},
                  {icon:"📊",label:"Total Queries",val:totalQueries.toLocaleString(),sub:"session total",col:C.gold},
                  {icon:"◈",label:"AI Insights",val:`${aiEnabled}/${users.length}`,sub:"users with key",col:C.purple},
                  {icon:"🌍",label:"Ghana Users",val:ghanaUsers,sub:`${Math.round(ghanaUsers/users.length*100)}% of base`,col:C.teal},
                ].map((k,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <span style={{fontSize:22}}>{k.icon}</span>
                      <div style={{width:8,height:8,borderRadius:"50%",background:k.col}}/>
                    </div>
                    <div style={{fontSize:26,fontWeight:800,color:k.col,marginBottom:3}}>{k.val}</div>
                    <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{k.label}</div>
                    <div style={{fontSize:10,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
                  </div>
                ))}
              </div>
              {/* Sources status grid */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{margin:0,fontSize:13,fontWeight:700,color:C.text}}>🌐 Data Source Health</h3>
                  <span style={{color:C.teal,fontSize:10,fontFamily:C.mono}}>● {sourceStatuses.filter(s=>s.status==="live").length}/{sourceStatuses.length} live</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {sourceStatuses.map((s,i)=>(
                    <div key={i} style={{background:C.surface,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justify:"space-between",alignItems:"center",marginBottom:5}}>
                        <span style={{color:s.color,fontSize:12,fontWeight:700,fontFamily:C.mono}}>{s.short}</span>
                        {statusBadge(s.status)}
                      </div>
                      <div style={{color:C.mid,fontSize:9,fontFamily:C.mono}}>{s.latency!=="—"?s.latency:"proxied"}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Recent activity */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.text}}>📋 Recent Activity</h3>
                {MOCK_ACTIVITY.slice(0,5).map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
                    <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,width:36,flexShrink:0}}>{a.time}</span>
                    <span style={{color:C.gold,fontSize:11,fontFamily:C.mono,width:120,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.user}</span>
                    <span style={{color:C.teal,fontSize:10,fontFamily:C.mono,width:140,flexShrink:0}}>{a.action}</span>
                    <span style={{color:C.mid,fontSize:10,fontFamily:C.mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.detail}</span>
                  </div>
                ))}
                <button onClick={()=>setTab("activity")} style={{marginTop:12,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 16px",color:C.mid,fontSize:11,cursor:"pointer",fontFamily:C.mono}}>View all activity →</button>
              </div>
            </>
          )}

          {/* ── USERS ── */}
          {tab==="users"&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>👥 User Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>{filteredUsers.length} of {users.length} users</p></div>
                <button onClick={()=>notify("Invite sent (demo)","success")} style={{background:C.gold,color:"#000",border:"none",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>+ Invite User</button>
              </div>
              {/* Filters */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="🔍 Search users..." style={{...inp,width:240,fontSize:12,padding:"8px 12px"}}/>
                <div style={{display:"flex",gap:5}}>
                  {["all","admin","analyst","user"].map(r=>(
                    <button key={r} onClick={()=>setRoleFilter(r)} style={{...pill(roleFilter===r),textTransform:"capitalize",padding:"5px 12px",fontSize:10}}>{r}</button>
                  ))}
                </div>
              </div>
              {/* Table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["User","Email","Role","Status","Joined","Last Seen","Queries","API Keys","Actions"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 14px",fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u,i)=>(
                      <tr key={u.id} style={{background:i%2?`${C.surface}55`:"transparent",cursor:"pointer"}} onClick={()=>setSelectedUser(selectedUser?.id===u.id?null:u)}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#000"}}>{u.username.slice(0,2).toUpperCase()}</div>
                            <span style={{color:C.text,fontWeight:600}}>{u.username}</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{background:u.role==="admin"?`${C.gold}20`:u.role==="analyst"?`${C.teal}20`:`${C.blue}20`,color:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{u.role}</span>
                        </td>
                        <td style={{padding:"10px 14px"}}><span style={{color:u.status==="active"?C.teal:C.red,fontSize:9}}>● {u.status}</span></td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.joined}</td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.lastSeen}</td>
                        <td style={{padding:"10px 14px",color:C.gold,fontWeight:600}}>{u.queries}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <span style={{color:u.anthropicKey?C.teal:C.dim,fontSize:9}} title="Anthropic">◈</span>
                            <span style={{color:u.fredKey?C.red:C.dim,fontSize:9}} title="FRED">🏦</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={e=>{e.stopPropagation();notify(`Editing ${u.username} (demo)`);}} style={{background:`${C.blue}18`,border:`1px solid ${C.blue}44`,borderRadius:5,padding:"3px 8px",color:C.blue,fontSize:9,cursor:"pointer"}}>Edit</button>
                            {u.role!=="admin"&&<button onClick={e=>{e.stopPropagation();setUsers(us=>us.map(x=>x.id===u.id?{...x,status:x.status==="active"?"inactive":"active"}:x));}} style={{background:`${u.status==="active"?C.red:C.teal}18`,border:`1px solid ${u.status==="active"?C.red:C.teal}44`,borderRadius:5,padding:"3px 8px",color:u.status==="active"?C.red:C.teal,fontSize:9,cursor:"pointer"}}>{u.status==="active"?"Disable":"Enable"}</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedUser&&(
                <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"18px 20px"}}>
                  <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.gold}}>👤 {selectedUser.username} — Details</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[{l:"Email",v:selectedUser.email},{l:"Role",v:selectedUser.role},{l:"Country",v:selectedUser.country},{l:"Queries",v:selectedUser.queries},{l:"Joined",v:selectedUser.joined},{l:"Last Seen",v:selectedUser.lastSeen},{l:"Anthropic Key",v:selectedUser.anthropicKey?"Configured":"Not set"},{l:"FRED Key",v:selectedUser.fredKey?"Configured":"Not set"}].map(({l,v})=>(
                      <div key={l} style={{background:C.surface,borderRadius:8,padding:"10px 13px"}}>
                        <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{l}</div>
                        <div style={{color:C.text,fontSize:12,fontWeight:600}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SOURCES ── */}
          {tab==="sources"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>🌐 Data Source Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Monitor and test all connected data APIs</p></div>
              {sourceStatuses.map((s,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:12,padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.status==="live"?C.teal:s.status==="error"?C.red:s.status==="key-required"?C.gold:C.blue,flexShrink:0}}/>
                      <div>
                        <div style={{color:C.text,fontSize:13,fontWeight:700}}>{s.name}</div>
                        <div style={{display:"flex",gap:14,marginTop:3}}>
                          <span style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Latency: {s.latency}</span>
                          <span style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Uptime: {s.uptime}</span>
                          {statusBadge(s.status)}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {s.status==="key-required"&&<span style={{color:C.gold,fontSize:10,fontFamily:C.mono}}>⚠ Requires API key from users</span>}
                      {s.status==="proxied"&&<span style={{color:C.blue,fontSize:10,fontFamily:C.mono}}>◎ Data via World Bank / IMF proxy</span>}
                      <button onClick={()=>pingSource(i)} disabled={pingLoading[i]} style={{background:`${s.color}15`,border:`1px solid ${s.color}44`,borderRadius:7,padding:"7px 16px",color:s.color,fontSize:11,cursor:"pointer",fontFamily:C.mono,opacity:pingLoading[i]?.6:1}}>
                        {pingLoading[i]?"Pinging…":"Ping →"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── ACTIVITY ── */}
          {tab==="activity"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>📋 Activity Log</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>All user actions — today</p></div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["Time","User","Action","Detail"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 16px",fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_ACTIVITY.map((a,i)=>(
                      <tr key={i} style={{background:i%2?`${C.surface}55`:"transparent"}}>
                        <td style={{padding:"9px 16px",color:C.dim,whiteSpace:"nowrap"}}>{a.time}</td>
                        <td style={{padding:"9px 16px",color:C.gold,fontWeight:600}}>{a.user}</td>
                        <td style={{padding:"9px 16px"}}><span style={{background:`${C.teal}18`,color:C.teal,borderRadius:5,padding:"2px 8px",fontSize:9}}>{a.action}</span></td>
                        <td style={{padding:"9px 16px",color:C.mid}}>{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── CONFIG ── */}
          {tab==="config"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>⚙ System Configuration</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Platform-wide settings — admin only</p></div>
              {/* Platform */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Platform Settings</div>
                {[{l:"Platform Name",v:"EcoScope"},{l:"Version",v:"v2.0"},{l:"Environment",v:"Development"},{l:"Base URL",v:"http://localhost:3000"}].map(({l,v})=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Access control */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Access Control</div>
                {[{l:"Open Registration",v:true},{l:"Require Email Verification",v:false},{l:"Allow Guest Access",v:true},{l:"Max Users",v:"Unlimited (demo)"}].map(({l,v},i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    {typeof v==="boolean"
                      ?<button onClick={()=>notify(`${l} toggled (demo)`)} style={{background:v?`${C.teal}20`:`${C.dim}20`,border:`1px solid ${v?C.teal:C.dim}44`,borderRadius:12,padding:"4px 12px",color:v?C.teal:C.dim,fontSize:10,cursor:"pointer",fontFamily:C.mono}}>{v?"Enabled":"Disabled"}</button>
                      :<span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                    }
                  </div>
                ))}
              </div>
              {/* Roles */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Role Permissions</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[
                    {role:"Admin",col:C.gold,perms:["Full platform access","User management","System config","All data sources","AI Insights","Activity logs"]},
                    {role:"Analyst",col:C.teal,perms:["All data sources","AI Insights","CSV export","Compare countries","Save charts","View activity (own)"]},
                    {role:"User",col:C.blue,perms:["All data sources","CSV export","Compare countries","Basic charts","Own settings","—"]},
                  ].map(({role,col,perms})=>(
                    <div key={role} style={{background:C.surface,border:`1px solid ${col}33`,borderRadius:9,padding:"13px 15px"}}>
                      <div style={{color:col,fontWeight:700,fontSize:12,marginBottom:10}}>{role}</div>
                      {perms.map((p,i)=><div key={i} style={{color:p==="—"?C.dim:C.mid,fontSize:10,fontFamily:C.mono,padding:"3px 0",borderBottom:i<perms.length-1?`1px solid ${C.border}`:"none"}}>{p!=="—"?"✓ ":""}{p}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,marginTop:4,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>EcoScope Admin Panel · v2.0 · {users.length} registered users · {sourceStatuses.filter(s=>s.status==="live").length} live sources</span>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>{new Date().toLocaleTimeString()}</span>
          </div>
        </main>
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}::-webkit-scrollbar-thumb:hover{background:${C.gold}55;}select option{background:${C.card};color:${C.text};}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}a{text-decoration:none;}`}</style>
    </div>
  );
}