// ecoscript/engine.js — split from App.js (code unchanged; only imports and exports were added)
import { meFEReg, meOLS, meWald } from "../impact/estimators";
import { dsParseTime } from "../impact/tabs";
import { meChi2Pval, meDot, meFPval, meInvNorm, meLnGamma, meMV, meMatMul, meNormCdf, meQF, meTPval, meTQuant, meZeros } from "../ui/settings";

// n: [min, max] arguments · g: group · d: what it does · ex: example · xl: Excel names that do the same · hide: Excel-only spelling (not listed)
const FX_FUNCS = {
  // ── Maths and rounding ──
  round_to: { n:[1,2], g:0, d:"Round to a number of decimals (half away from zero)", ex:"round_to(rate, 2)", xl:["ROUND"] },
  round_up: { n:[1,2], g:0, d:"Round away from zero to a number of decimals", ex:"round_up(price, 0)", xl:["ROUNDUP"] },
  round_down: { n:[1,2], g:0, d:"Cut off decimals without rounding", ex:"round_down(age, 0)", xl:["ROUNDDOWN","TRUNC"] },
  round_to_multiple: { n:[2,2], g:0, d:"Round to the nearest multiple", ex:"round_to_multiple(price, 5)", xl:["MROUND"] },
  round_up_to_multiple: { n:[1,2], g:0, d:"Round up to a multiple (1 if not given)", ex:"round_up_to_multiple(boxes, 12)", xl:["CEILING","CEILING.MATH"] },
  round_down_to_multiple: { n:[1,2], g:0, d:"Round down to a multiple (1 if not given)", ex:"round_down_to_multiple(age, 10)", xl:["FLOOR","FLOOR.MATH"] },
  whole_number: { n:[1,1], g:0, d:"Round down to a whole number", ex:"whole_number(years)", xl:["INT"] },
  remainder: { n:[2,2], g:0, d:"What is left after dividing", ex:"remainder(year, 4)", xl:["MOD"] },
  divide: { n:[2,3], g:0, d:"x ÷ y, with a value to use when y is zero or blank", ex:"divide(debt, gdp, 0)" },
  percent_of: { n:[2,2], g:0, d:"part as a percent of whole", ex:"percent_of(exports, gdp)" },
  percent_change: { n:[2,2], g:0, d:"Percent change from an old value to a new value", ex:"percent_change(price_2024, price_2023)" },
  power: { n:[2,2], g:0, d:"x to the power p (same as x ^ p)", ex:"power(1 + rate, years)", xl:["POWER"] },
  square_root: { n:[1,1], g:0, d:"Square root", ex:"square_root(area)", xl:["SQRT"] },
  absolute: { n:[1,1], g:0, d:"Value without its minus sign", ex:"absolute(balance)", xl:["ABS"] },
  sign_of: { n:[1,1], g:0, d:"1 if positive, −1 if negative, 0 if zero", ex:"sign_of(change)", xl:["SIGN"] },
  log: { n:[1,2], g:0, d:"Natural log; log(x, 10) or log10(x) for base 10", ex:"log(gdp)" },
  ln: { n:[1,1], g:0, d:"Natural log", ex:"ln(gdp)", xl:["LN"] },
  log10: { n:[1,1], g:0, d:"Base-10 log", ex:"log10(population)", xl:["LOG10"] },
  exp: { n:[1,1], g:0, d:"e to the power x", ex:"exp(log_gdp)", xl:["EXP"] },
  pi: { n:[0,0], g:0, d:"3.14159…", ex:"pi() * radius ^ 2", xl:["PI"] },
  factorial: { n:[1,1], g:0, d:"1 × 2 × … × n", ex:"factorial(5)", xl:["FACT"] },
  random_number: { n:[0,0], g:0, d:"Random number between 0 and 1 (new each run)", ex:"random_number()", xl:["RAND"] },
  random_between: { n:[2,2], g:0, d:"Random whole number between two values", ex:"random_between(1, 6)", xl:["RANDBETWEEN"] },
  // ── Across columns ──
  average_across: { n:[1,200], g:1, d:"Average of several columns in each row (blanks skipped)", ex:"average_across(q1, q2, q3, q4)", xl:["AVERAGE (with 2+ columns)"] },
  total_across: { n:[1,200], g:1, d:"Total of several columns in each row", ex:"total_across(q1, q2, q3, q4)", xl:["SUM (with 2+ columns)"] },
  count_across: { n:[1,200], g:1, d:"How many of the columns are filled in each row", ex:"count_across(q1, q2, q3)", xl:["COUNTA (with 2+ columns)"] },
  count_blank_across: { n:[1,200], g:1, d:"How many of the columns are blank in each row", ex:"count_blank_across(q1, q2, q3)", xl:["COUNTBLANK"] },
  smallest_across: { n:[1,200], g:1, d:"Smallest value among the columns in each row", ex:"smallest_across(a, b, c)", xl:["MIN (with 2+ columns)"] },
  largest_across: { n:[1,200], g:1, d:"Largest value among the columns in each row", ex:"largest_across(a, b, c)", xl:["MAX (with 2+ columns)"] },
  median_across: { n:[1,200], g:1, d:"Middle value among the columns in each row", ex:"median_across(a, b, c)", xl:["MEDIAN (with 2+ columns)"] },
  spread_across: { n:[2,200], g:1, d:"Standard deviation across the columns in each row", ex:"spread_across(y2020, y2021, y2022)", xl:["STDEV (with 2+ columns)"] },
  product_across: { n:[1,200], g:1, d:"Multiply the columns together in each row", ex:"product_across(price, quantity)", xl:["PRODUCT"] },
  slope_across: { n:[2,200], g:1, d:"Trend in each row: change per column from a straight line through the values (one column per year = change per year). Blanks skipped", ex:"slope_across(col2, col4, col6, col8)", xl:["SLOPE(row of values, row of years)"] },
  slope_against_names: { n:[2,200], g:1, d:"Trend of each row against the years in the column names (2013, y2013, score_2013 all read as 2013)", ex:"slope_against_names([2013], [2014], [2015], [2016])", xl:["SLOPE(B3:M3, $B$1:$M$1)"] },
  r_squared_against_names: { n:[3,200], g:1, d:"How well that line fits each row (0 to 1)", ex:"r_squared_against_names([2013], [2014], [2015])" },
  slope_against_row: { n:[3,201], g:1, d:"Trend of each row against a fixed row of the same columns (e.g. the row that holds the years): (row number, columns…)", ex:"slope_against_row(1, col3, col5, col7, col9)", xl:["SLOPE(B3:M3, $B$2:$M$2)"] },
  r_squared_against_row: { n:[3,201], g:1, d:"How well that line fits each row (0 to 1): (row number, columns…)", ex:"r_squared_against_row(1, col3, col5, col7)", xl:["RSQ(B3:M3, $B$2:$M$2)"] },
  r_squared_across: { n:[3,200], g:1, d:"How well that straight line fits each row (0 to 1)", ex:"r_squared_across(col2, col4, col6, col8)", xl:["RSQ(row of values, row of years)"] },
  first_filled: { n:[2,200], g:1, d:"First value that is not blank", ex:"first_filled(gdp_wb, gdp_imf)" },
  // ── Whole-column statistics (within each unit when one is chosen) ──
  column_average: { n:[1,1], g:2, d:"Average of the whole column (same value in every row)", ex:"income - column_average(income)", xl:["AVERAGE (one column)"] },
  column_total: { n:[1,1], g:2, d:"Total of the whole column", ex:"sales / column_total(sales) * 100", xl:["SUM (one column)"] },
  column_count: { n:[1,1], g:2, d:"How many numbers the column has", ex:"column_count(score)", xl:["COUNT"] },
  column_count_filled: { n:[1,1], g:2, d:"How many cells are filled (numbers or text)", ex:"column_count_filled(name)", xl:["COUNTA (one column)"] },
  count_distinct: { n:[1,1], g:2, d:"How many different values the column has", ex:"count_distinct(country)" },
  column_median: { n:[1,1], g:2, d:"Middle value of the column", ex:"column_median(income)", xl:["MEDIAN (one column)"] },
  column_min: { n:[1,1], g:2, d:"Smallest value in the column", ex:"column_min(price)", xl:["MIN (one column)"] },
  column_max: { n:[1,1], g:2, d:"Largest value in the column", ex:"column_max(price)", xl:["MAX (one column)"] },
  column_sd: { n:[1,1], g:2, d:"Standard deviation of the column (sample)", ex:"column_sd(returns)", xl:["STDEV","STDEV.S"] },
  column_variance: { n:[1,1], g:2, d:"Variance of the column (sample)", ex:"column_variance(returns)", xl:["VAR","VAR.S"] },
  column_percentile: { n:[2,2], g:2, d:"Value below which p% of the column falls (p from 0 to 100)", ex:"column_percentile(income, 90)", xl:["PERCENTILE (uses 0 to 1)"] },
  column_quartile: { n:[2,2], g:2, d:"Quartile 0 to 4 of the column", ex:"column_quartile(income, 1)", xl:["QUARTILE"] },
  column_mode: { n:[1,1], g:2, d:"Most common value", ex:"column_mode(region)", xl:["MODE"] },
  rank_in_column: { n:[1,2], g:2, d:"Rank, 1 = largest (or \"smallest\" first)", ex:"rank_in_column(gdp)  or  rank_in_column(cost, \"smallest\")", xl:["RANK"] },
  percent_rank: { n:[1,1], g:2, d:"Percent of values below this one (0 to 100)", ex:"percent_rank(score)", xl:["PERCENTRANK (gives 0 to 1)"] },
  standardise: { n:[1,1], g:2, d:"(x − average) ÷ standard deviation", ex:"standardise(score)", xl:["STANDARDIZE"] },
  rescale_0_100: { n:[1,1], g:2, d:"Rescale so the smallest is 0 and the largest 100", ex:"rescale_0_100(index)" },
  share_of_total: { n:[1,1], g:2, d:"Percent of the column total", ex:"share_of_total(exports)" },
  correlation: { n:[2,2], g:2, d:"Correlation between two columns (−1 to 1)", ex:"correlation(gdp, exports)", xl:["CORREL","PEARSON"] },
  covariance: { n:[2,2], g:2, d:"Covariance between two columns (sample)", ex:"covariance(x, y)", xl:["COVARIANCE.S"] },
  slope: { n:[2,2], g:2, d:"Slope of the straight line of y on x", ex:"slope(sales, advertising)", xl:["SLOPE"] },
  intercept: { n:[2,2], g:2, d:"Where the straight line of y on x crosses zero", ex:"intercept(sales, advertising)", xl:["INTERCEPT"] },
  r_squared: { n:[2,2], g:2, d:"How well a straight line of y on x fits (0 to 1)", ex:"r_squared(sales, advertising)", xl:["RSQ"] },
  trend_value: { n:[2,2], g:2, d:"The straight-line (fitted) value of y for each row's x", ex:"trend_value(sales, year)", xl:["TREND"] },
  // ── Conditional ──
  total_if: { n:[2,2], g:3, d:"Total of values in rows where the condition holds", ex:"total_if(sales, region == \"West\")", xl:["SUMIF","SUMIFS"] },
  average_if: { n:[2,2], g:3, d:"Average of values in rows where the condition holds", ex:"average_if(score, sex == \"F\")", xl:["AVERAGEIF","AVERAGEIFS"] },
  count_if: { n:[1,1], g:3, d:"How many rows meet the condition", ex:"count_if(inflation > 10)", xl:["COUNTIF","COUNTIFS"] },
  largest_if: { n:[2,2], g:3, d:"Largest value in rows where the condition holds", ex:"largest_if(price, year == 2024)", xl:["MAXIFS"] },
  smallest_if: { n:[2,2], g:3, d:"Smallest value in rows where the condition holds", ex:"smallest_if(price, year == 2024)", xl:["MINIFS"] },
  total_for_each: { n:[2,2], g:3, d:"Total of values for each group, shown on every row of that group", ex:"total_for_each(sales, country)", xl:["SUMIF(range, this row, values)"] },
  average_for_each: { n:[2,2], g:3, d:"Average for each group", ex:"average_for_each(income, district)", xl:["AVERAGEIF(range, this row, values)"] },
  count_for_each: { n:[1,1], g:3, d:"How many rows each group has", ex:"count_for_each(country)", xl:["COUNTIF(range, this row)"] },
  largest_for_each: { n:[2,2], g:3, d:"Largest value in each group", ex:"largest_for_each(price, ticker)" },
  smallest_for_each: { n:[2,2], g:3, d:"Smallest value in each group", ex:"smallest_for_each(price, ticker)" },
  // ── Logic and checks ──
  if: { n:[2,3], g:4, d:"if(condition, value if yes, value if no)", ex:"if(gdp_growth < 0, \"recession\", \"growth\")", xl:["IF"] },
  first_true: { n:[2,200], g:4, d:"Checks conditions in order and gives the value for the first that holds; a last value on its own is the default", ex:"first_true(score >= 70, \"A\", score >= 50, \"B\", \"C\")", xl:["IFS"] },
  match_value: { n:[3,200], g:4, d:"Compares a value with a list of cases; a last value on its own is the default", ex:"match_value(code, 1, \"Urban\", 2, \"Rural\", \"Other\")", xl:["SWITCH"] },
  pick_by_number: { n:[2,200], g:4, d:"Picks the 1st, 2nd, … value from the list", ex:"pick_by_number(quarter, \"Q1\", \"Q2\", \"Q3\", \"Q4\")", xl:["CHOOSE"] },
  all_true: { n:[1,50], g:4, d:"1 if every condition holds", ex:"all_true(age >= 18, age < 65)", xl:["AND"] },
  any_true: { n:[1,50], g:4, d:"1 if at least one condition holds", ex:"any_true(region == \"North\", region == \"East\")", xl:["OR"] },
  only_one_true: { n:[1,50], g:4, d:"1 if an odd number of the conditions hold", ex:"only_one_true(a > 0, b > 0)", xl:["XOR"] },
  not: { n:[1,1], g:4, d:"Turns yes into no and no into yes", ex:"not(is_blank(income))", xl:["NOT"] },
  between: { n:[3,3], g:4, d:"1 if the value is between two limits (limits included)", ex:"between(age, 15, 24)" },
  in_list: { n:[2,200], g:4, d:"1 if the value equals any of the listed values", ex:"in_list(ticker, \"NUE\", \"STLD\")" },
  is_blank: { n:[1,1], g:4, d:"1 if the cell is empty", ex:"is_blank(income)", xl:["ISBLANK"] },
  is_number: { n:[1,1], g:4, d:"1 if the cell holds a number", ex:"is_number(code)", xl:["ISNUMBER"] },
  is_text: { n:[1,1], g:4, d:"1 if the cell holds text", ex:"is_text(code)", xl:["ISTEXT"] },
  is_error: { n:[1,1], g:4, d:"TRUE when the value is an error or cannot be worked out (#DIV/0!, #N/A, #VALUE! ...)", ex:"is_error(gdp / pop)", xl:["ISERROR","ISERR"] },
  is_na: { n:[1,1], g:4, d:"TRUE when the value is #N/A (not available), for example a look-up that found nothing", ex:"is_na(look_up(code, iso3, name))", xl:["ISNA"] },
  error_type: { n:[1,1], g:4, d:"Number of the error: 1 #NULL!, 2 #DIV/0!, 3 #VALUE!, 4 #REF!, 5 #NAME?, 6 #NUM!, 7 #N/A; #N/A when there is no error", ex:"error_type(B3)", xl:["ERROR.TYPE"] },
  if_blank: { n:[2,2], g:4, d:"The value, or a replacement when it is blank or cannot be worked out", ex:"if_blank(inflation, 0)", xl:["IFERROR","IFNA"] },
  // ── Text ──
  join_text: { n:[1,200], g:5, d:"Join values into one text (you can also use &)", ex:"join_text(first_name, \" \", last_name)", xl:["CONCAT","CONCATENATE"] },
  join_with: { n:[2,200], g:5, d:"Join values with a separator, skipping blanks", ex:"join_with(\", \", district, region, country)", xl:["TEXTJOIN"] },
  first_letters: { n:[1,2], g:5, d:"The first n characters", ex:"first_letters(code, 3)", xl:["LEFT"] },
  last_letters: { n:[1,2], g:5, d:"The last n characters", ex:"last_letters(phone, 4)", xl:["RIGHT"] },
  middle_letters: { n:[3,3], g:5, d:"n characters starting at a position", ex:"middle_letters(id, 4, 2)", xl:["MID"] },
  text_before: { n:[2,2], g:5, d:"The text before a separator", ex:"text_before(email, \"@\")", xl:["TEXTBEFORE"] },
  text_after: { n:[2,2], g:5, d:"The text after a separator", ex:"text_after(email, \"@\")", xl:["TEXTAFTER"] },
  split_part: { n:[3,3], g:5, d:"The nth piece when text is split by a separator", ex:"split_part(name, \" \", 2)", xl:["TEXTSPLIT"] },
  text_length: { n:[1,1], g:5, d:"Number of characters", ex:"text_length(comment)", xl:["LEN"] },
  word_count: { n:[1,1], g:5, d:"Number of words", ex:"word_count(answer)" },
  upper_case: { n:[1,1], g:5, d:"CAPITAL LETTERS", ex:"upper_case(country_code)", xl:["UPPER"] },
  lower_case: { n:[1,1], g:5, d:"small letters", ex:"lower_case(email)", xl:["LOWER"] },
  title_case: { n:[1,1], g:5, d:"First Letter Of Each Word In Capitals", ex:"title_case(name)", xl:["PROPER"] },
  trim_spaces: { n:[1,1], g:5, d:"Remove extra spaces", ex:"trim_spaces(name)", xl:["TRIM","CLEAN"] },
  replace_text: { n:[3,3], g:5, d:"Replace every copy of some text with other text", ex:"replace_text(region, \"Gt.\", \"Greater\")", xl:["SUBSTITUTE"] },
  position_of: { n:[2,2], g:5, d:"Where some text first appears (1 = first character), blank if not found", ex:"position_of(\"@\", email)", xl:["SEARCH","FIND"] },
  contains: { n:[2,2], g:5, d:"1 if the text contains the part (capitals ignored)", ex:"contains(comment, \"price\")" },
  starts_with: { n:[2,2], g:5, d:"1 if the text starts with the part", ex:"starts_with(code, \"GH\")" },
  ends_with: { n:[2,2], g:5, d:"1 if the text ends with the part", ex:"ends_with(file, \".pdf\")" },
  same_text: { n:[2,2], g:5, d:"1 if two texts are exactly the same (capitals count)", ex:"same_text(a, b)", xl:["EXACT"] },
  repeat_text: { n:[2,2], g:5, d:"Repeat text n times", ex:"repeat_text(\"*\", stars)", xl:["REPT"] },
  to_number: { n:[1,1], g:5, d:"Turn text like \"1,200\" or \"GHS 45\" into a number", ex:"to_number(amount_text)", xl:["VALUE","NUMBERVALUE"] },
  extract_number: { n:[1,1], g:5, d:"Pull the first number out of text (\"GHS 1,200.50\" → 1200.5)", ex:"extract_number(price_text)" },
  to_text: { n:[1,1], g:5, d:"Turn a value into text", ex:"to_text(year) & \"-Q1\"" },
  format_number: { n:[1,2], g:5, d:"Text with thousands separators and set decimals", ex:"format_number(gdp, 0)", xl:["FIXED","TEXT"] },
  format_percent: { n:[1,2], g:5, d:"A share as percent text (0.256 → \"25.6%\")", ex:"format_percent(share, 1)" },
  // ── Dates ──
  today: { n:[0,0], g:6, d:"Today's date", ex:"days_between(start_date, today())", xl:["TODAY","NOW"] },
  make_date: { n:[3,3], g:6, d:"Build a date from year, month and day", ex:"make_date(year, month, 1)", xl:["DATE"] },
  to_date: { n:[1,1], g:6, d:"Read text such as \"15 March 2024\" or \"3/15/2024\" as a date (2024-03-15)", ex:"to_date(date_text)", xl:["DATEVALUE"] },
  year: { n:[1,1], g:6, d:"Year of a date or period", ex:"year(date)", xl:["YEAR"] },
  month: { n:[1,1], g:6, d:"Month number (1 to 12)", ex:"month(date)", xl:["MONTH"] },
  quarter: { n:[1,1], g:6, d:"Quarter (1 to 4)", ex:"quarter(date)" },
  day_of_month: { n:[1,1], g:6, d:"Day of the month (1 to 31)", ex:"day_of_month(date)", xl:["DAY"] },
  weekday_number: { n:[1,1], g:6, d:"Day of the week, Monday = 1 … Sunday = 7", ex:"weekday_number(date)", xl:["WEEKDAY"] },
  weekday_name: { n:[1,1], g:6, d:"Monday, Tuesday, …", ex:"weekday_name(date)" },
  month_name: { n:[1,1], g:6, d:"January, February, …", ex:"month_name(date)" },
  week_number: { n:[1,1], g:6, d:"Week of the year (ISO weeks start on Monday)", ex:"week_number(date)", xl:["ISOWEEKNUM","WEEKNUM"] },
  days_between: { n:[2,2], g:6, d:"Days from the first date to the second", ex:"days_between(admitted, discharged)", xl:["DAYS (end date first)"] },
  months_between: { n:[2,2], g:6, d:"Whole months from the first date to the second", ex:"months_between(start, today())", xl:["DATEDIF(…, \"m\")"] },
  years_between: { n:[2,2], g:6, d:"Whole years from the first date to the second", ex:"years_between(birth_date, today())", xl:["DATEDIF(…, \"y\")"] },
  year_fraction: { n:[2,2], g:6, d:"Years between two dates, with decimals", ex:"year_fraction(issue_date, maturity)", xl:["YEARFRAC"] },
  workdays_between: { n:[2,2], g:6, d:"Monday-to-Friday days between two dates (both counted)", ex:"workdays_between(start, end)", xl:["NETWORKDAYS"] },
  add_days: { n:[2,2], g:6, d:"Date plus a number of days", ex:"add_days(order_date, 30)" },
  add_months: { n:[2,2], g:6, d:"Date plus a number of months", ex:"add_months(start, 6)", xl:["EDATE"] },
  add_years: { n:[2,2], g:6, d:"Date plus a number of years", ex:"add_years(start, 1)" },
  end_of_month: { n:[1,2], g:6, d:"Last day of the month (optionally n months later)", ex:"end_of_month(date)", xl:["EOMONTH"] },
  age: { n:[1,2], g:6, d:"Age in whole years today (or on a given date)", ex:"age(birth_date)" },
  format_date: { n:[2,2], g:6, d:"Date as text in your own layout: YYYY, MM, MMM, MMMM, DD, DDDD", ex:"format_date(date, \"MMM YYYY\")", xl:["TEXT"] },
  period: { n:[1,1], g:6, d:"Date or period as a decimal year (2018-03 = 2018.17), for comparisons", ex:"if(period(time) >= period(\"2018-03\"), 1, 0)" },
  // ── Lookup ──
  look_up: { n:[3,4], g:7, d:"Find the value in a column of this table and return the matching value from another column", ex:"look_up(\"Ghana\", country, gdp)", xl:["XLOOKUP","VLOOKUP"] },
  look_up_from: { n:[4,5], g:7, d:"Look up in another dataset: (dataset name, value, column to match there, column to return)", ex:"look_up_from(\"country codes\", country, name, iso3)", xl:["VLOOKUP into another sheet"] },
  position_in: { n:[2,2], g:7, d:"Row number where the value is first found in a column", ex:"position_in(\"Ghana\", country)", xl:["MATCH"] },
  value_at_row: { n:[2,2], g:7, d:"The value of a column in a given row number", ex:"value_at_row(gdp, 1)", xl:["INDEX"] },
  row_number: { n:[0,0], g:7, d:"1 for the first row, 2 for the second, …", ex:"row_number()", xl:["ROW"] },
  count_rows: { n:[0,0], g:7, d:"How many rows the table has", ex:"count_rows()", xl:["ROWS"] },
  // ── Over time (in time order, within each unit when one is chosen) ──
  previous_value: { n:[1,2], g:8, d:"Value 1 (or k) periods earlier", ex:"previous_value(gdp)" },
  next_value: { n:[1,2], g:8, d:"Value 1 (or k) periods later", ex:"next_value(gdp, 2)" },
  change: { n:[1,2], g:8, d:"Change from the previous period", ex:"change(debt)" },
  growth_rate: { n:[1,2], g:8, d:"Percent change from the previous period", ex:"growth_rate(cpi)" },
  moving_average: { n:[2,2], g:8, d:"Average of the last n periods (this one included)", ex:"moving_average(inflation, 3)" },
  moving_total: { n:[2,2], g:8, d:"Total of the last n periods", ex:"moving_total(rainfall, 12)" },
  running_total: { n:[1,1], g:8, d:"Total so far", ex:"running_total(aid)" },
  running_average: { n:[1,1], g:8, d:"Average so far", ex:"running_average(score)" },
  highest_so_far: { n:[1,1], g:8, d:"Largest value up to this period", ex:"highest_so_far(price)" },
  lowest_so_far: { n:[1,1], g:8, d:"Smallest value up to this period", ex:"lowest_so_far(price)" },
  index_to_100: { n:[1,1], g:8, d:"Rescale so the first period = 100", ex:"index_to_100(gdp)" },
  average_growth: { n:[1,1], g:8, d:"Average yearly (per period) growth from first to last value, percent", ex:"average_growth(gdp)" },
  // ── Markets and technical indicators (TA-Lib definitions; within each unit, in time order) ──
  ema: { n:[2,2], g:8, d:"Exponential moving average over n periods (seeded with the simple average)", ex:"ema(close, 20)", xl:["EMA (TA-Lib)"] },
  rsi: { n:[1,2], g:8, d:"Relative Strength Index, 0 to 100 (Wilder, default 14 periods)", ex:"rsi(close, 14)", xl:["RSI (TA-Lib)"] },
  macd: { n:[1,3], g:8, d:"MACD line: fast EMA minus slow EMA (default 12 and 26)", ex:"macd(close)", xl:["MACD"] },
  macd_signal: { n:[1,4], g:8, d:"MACD signal line: EMA of the MACD line (default 9)", ex:"macd_signal(close)" },
  macd_histogram: { n:[1,4], g:8, d:"MACD line minus its signal line", ex:"macd_histogram(close)" },
  bollinger_upper: { n:[1,3], g:8, d:"Upper Bollinger band: moving average + k standard deviations (default 20, 2)", ex:"bollinger_upper(close, 20, 2)", xl:["BBANDS"] },
  bollinger_lower: { n:[1,3], g:8, d:"Lower Bollinger band: moving average − k standard deviations", ex:"bollinger_lower(close, 20, 2)" },
  rolling_sd: { n:[2,2], g:8, d:"Standard deviation of the last n periods (volatility)", ex:"rolling_sd(returns, 20)", xl:["STDDEV"] },
  log_return: { n:[1,1], g:8, d:"Log return: ln(this period / previous period)", ex:"log_return(close)" },
  rate_of_change: { n:[1,2], g:8, d:"Percent change over n periods (default 10)", ex:"rate_of_change(close, 10)", xl:["ROC"] },
  momentum: { n:[1,2], g:8, d:"Difference from n periods earlier (default 10)", ex:"momentum(close, 10)", xl:["MOM"] },
  drawdown: { n:[1,1], g:8, d:"Percent below the highest value so far (0 at a new high)", ex:"drawdown(close)" },
  true_range: { n:[3,3], g:8, d:"True range: largest of high−low, |high−previous close|, |low−previous close|", ex:"true_range(high, low, close)", xl:["TRANGE"] },
  atr: { n:[3,4], g:8, d:"Average true range, Wilder smoothing (default 14)", ex:"atr(high, low, close, 14)", xl:["ATR"] },
  stochastic_k: { n:[3,4], g:8, d:"Stochastic %K: where the close sits in the n-period high–low range, 0 to 100 (default 14)", ex:"stochastic_k(high, low, close, 14)", xl:["STOCH"] },
  on_balance_volume: { n:[2,2], g:8, d:"On-balance volume: running total adding volume on up days, subtracting on down days", ex:"on_balance_volume(close, volume)", xl:["OBV"] },
  // ── Finance (rates as decimals: 5% = 0.05) ──
  loan_payment: { n:[3,4], g:9, d:"Payment each period to repay a loan: (rate, periods, amount)", ex:"loan_payment(0.24 / 12, 36, 50000)", xl:["PMT (gives a negative number)"] },
  future_value: { n:[3,4], g:9, d:"What saving a payment each period grows to: (rate, periods, payment, starting amount)", ex:"future_value(0.1, 10, 1000, 0)", xl:["FV"] },
  present_value: { n:[3,4], g:9, d:"What a stream of payments is worth today: (rate, periods, payment, final amount)", ex:"present_value(0.08, 20, 5000)", xl:["PV"] },
  net_present_value: { n:[2,200], g:9, d:"Today's value of cash flows in the next periods: (rate, cash1, cash2, …)", ex:"net_present_value(0.1, y1, y2, y3)", xl:["NPV"] },
  internal_rate_of_return: { n:[2,200], g:9, d:"Rate that makes the cash flows worth zero (first one usually negative)", ex:"internal_rate_of_return(y0, y1, y2, y3)", xl:["IRR"] },
  periods_needed: { n:[3,3], g:9, d:"Periods to repay a loan: (rate, payment, amount)", ex:"periods_needed(0.02, 1500, 30000)", xl:["NPER"] },
  interest_rate: { n:[3,3], g:9, d:"Rate per period of a loan: (periods, payment, amount)", ex:"interest_rate(36, 1800, 50000)", xl:["RATE"] },
  cagr: { n:[3,3], g:9, d:"Compound annual growth rate in percent: (start value, end value, years)", ex:"cagr(gdp_2015, gdp_2024, 9)", xl:["RRI (gives a decimal)"] },
  effective_rate: { n:[2,2], g:9, d:"Yearly rate after compounding: (nominal rate, times per year)", ex:"effective_rate(0.24, 12)", xl:["EFFECT"] },
  depreciation: { n:[3,3], g:9, d:"Straight-line depreciation per year: (cost, salvage value, life in years)", ex:"depreciation(120000, 20000, 5)", xl:["SLN"] },
  // ── Excel spellings whose arguments differ (work, but not listed) ──
  SUMIF:{ n:[2,3], hide:1 }, SUMIFS:{ n:[3,201], hide:1 }, COUNTIF:{ n:[2,2], hide:1 }, COUNTIFS:{ n:[2,200], hide:1 }, AVERAGEIF:{ n:[2,3], hide:1 }, AVERAGEIFS:{ n:[3,201], hide:1 }, MAXIFS:{ n:[3,201], hide:1 }, MINIFS:{ n:[3,201], hide:1 },
  TEXTJOIN:{ n:[3,200], hide:1 }, TEXT:{ n:[2,2], hide:1 }, PERCENTILE:{ n:[2,2], hide:1 }, PERCENTRANK:{ n:[2,2], hide:1 }, RANK:{ n:[1,3], hide:1 }, STANDARDIZE:{ n:[3,3], hide:1 }, WEEKDAY:{ n:[1,2], hide:1 },
  DAYS:{ n:[2,2], hide:1 }, DATEDIF:{ n:[3,3], hide:1 }, XLOOKUP:{ n:[3,4], hide:1 }, MATCH:{ n:[2,3], hide:1 }, INDEX:{ n:[1,3], hide:1 }, PMT:{ n:[3,5], hide:1 }, FV:{ n:[3,5], hide:1 }, PV:{ n:[3,5], hide:1 }, NPER:{ n:[3,5], hide:1 }, RATE:{ n:[3,6], hide:1 }, RRI:{ n:[3,3], hide:1 },
  AVERAGE:{ n:[1,200], hide:1 }, SUM:{ n:[1,200], hide:1 }, MIN:{ n:[1,200], hide:1 }, MAX:{ n:[1,200], hide:1 }, MEDIAN:{ n:[1,200], hide:1 }, COUNT:{ n:[1,200], hide:1 }, COUNTA:{ n:[1,200], hide:1 }, STDEV:{ n:[1,200], hide:1 }, IFS:{ n:[2,200], hide:1 }, DATE:{ n:[3,3], hide:1 },
};
// other spellings → function (old EcoScope names and Excel names whose arguments match)
const FX_ALIAS = { iserror:"is_error", iserr:"is_error", isna:"is_na", "error.type":"error_type", sma:"moving_average", bbands_upper:"bollinger_upper", bbands_lower:"bollinger_lower", roc:"rate_of_change", mom:"momentum", trange:"true_range", obv:"on_balance_volume", stoch:"stochastic_k", volatility:"rolling_sd", round:"round_to", roundup:"round_up", rounddown:"round_down", trunc:"round_down", mround:"round_to_multiple", ceil:"round_up_to_multiple", ceiling:"round_up_to_multiple", "ceiling.math":"round_up_to_multiple", floor:"round_down_to_multiple", "floor.math":"round_down_to_multiple", int:"whole_number", mod:"remainder",
  pow:"power", sqrt:"square_root", abs:"absolute", sign:"sign_of", fact:"factorial", rand:"random_number", randbetween:"random_between",
  rowmean:"average_across", rowsum:"total_across", rowcount:"count_across", countblank:"count_blank_across", product:"product_across", coalesce:"first_filled",
  mean:"AVERAGE", sum:"SUM", min:"MIN", max:"MAX", median:"MEDIAN", count:"COUNT", sd:"STDEV", "stdev.s":"STDEV", var:"column_variance", "var.s":"column_variance", quartile:"column_quartile", mode:"column_mode", "mode.sngl":"column_mode",
  zscore:"standardise", standardize:"standardise", minmax:"rescale_0_100", share:"share_of_total", correl:"correlation", pearson:"correlation", "covariance.s":"covariance", covar:"covariance", rsq:"r_squared", trend:"trend_value", rank:"rank_in_column",
  ifs:"IFS", switch:"match_value", choose:"pick_by_number", and:"all_true", or:"any_true", xor:"only_one_true", inlist:"in_list", isblank:"is_blank", isnumber:"is_number", istext:"is_text", iferror:"if_blank", ifna:"if_blank",
  concat:"join_text", concatenate:"join_text", left:"first_letters", right:"last_letters", mid:"middle_letters", textbefore:"text_before", textafter:"text_after", len:"text_length", upper:"upper_case", lower:"lower_case", proper:"title_case", trim:"trim_spaces", clean:"trim_spaces",
  substitute:"replace_text", search:"position_of", find:"position_of", exact:"same_text", rept:"repeat_text", value:"to_number", numbervalue:"to_number", fixed:"format_number",
  now:"today", datevalue:"to_date", day:"day_of_month", isoweeknum:"week_number", weeknum:"week_number", yearfrac:"year_fraction", networkdays:"workdays_between", edate:"add_months", eomonth:"end_of_month",
  row:"row_number", rows:"count_rows", lag:"previous_value", lead:"next_value", diff:"change", pct_change:"growth_rate", growth:"growth_rate", ma:"moving_average", cumsum:"running_total", index_100:"index_to_100", npv:"net_present_value", irr:"internal_rate_of_return", effect:"effective_rate", sln:"depreciation" };
// Excel ideas that do not exist here, with what to use instead
const FX_NOT_HERE = { vlookup:"look_up(value, match_column, return_column), or look_up_from(\"other dataset\", value, match_column, return_column)", hlookup:"look_up(value, match_column, return_column)", lookup:"look_up(value, match_column, return_column)", indirect:"the column name itself", offset:"previous_value(column, k) or next_value(column, k)", sumproduct:"column_total(a * b)", subtotal:"column_total(…) or column_average(…)", aggregate:"column_total(…), column_average(…) and the other column functions", countunique:"count_distinct(column)", unique:"count_distinct(column), or the Dashboards table" };
const fxFuncName = (raw) => { const lw = raw.toLowerCase(); if (FX_FUNCS[lw] && !FX_FUNCS[lw].hide) return lw; const up = raw.toUpperCase(); if (FX_FUNCS[up] && FX_FUNCS[up].hide) return up; if (FX_ALIAS[lw]) return FX_ALIAS[lw]; if (FX_FUNCS[lw]) return lw; return null; };
const fxSuggest = (raw) => { const lw = raw.toLowerCase(); const all = [...Object.keys(FX_FUNCS).filter(k => !FX_FUNCS[k].hide), ...Object.keys(FX_ALIAS), ...Object.keys(FX_FUNCS).filter(k => FX_FUNCS[k].hide).map(k => k.toLowerCase())]; const dist = (a, b) => { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
  const hits = all.map(k => [k, k.includes(lw) || lw.includes(k) ? 0.5 : dist(lw, k)]).filter(([, s]) => s <= Math.max(2, lw.length / 3)).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => FX_ALIAS[k] && FX_FUNCS[FX_ALIAS[k]] && !FX_FUNCS[FX_ALIAS[k]].hide ? FX_ALIAS[k] : FX_FUNCS[k.toUpperCase()] && FX_FUNCS[k.toUpperCase()].hide ? k.toUpperCase() : k); return [...new Set(hits)]; };
// ── values ──
const FXB = (v) => v == null || v === "" || (typeof v === "number" && !isFinite(v));
const fxNum = (v) => { if (typeof v === "number") return isFinite(v) ? v : NaN; if (v == null || typeof v === "boolean") return v ? 1 : v === false ? 0 : NaN; let s = String(v).trim(); if (!s || /^(na|n\/a|nan|null|\.|-|\.\.|#n\/a|#div\/0!|#value!)$/i.test(s)) return NaN;
  let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } s = s.replace(/^[$€£₵¥]\s*/, "").replace(/^(ghs|usd|gh₵)\s*/i, "").replace(/,/g, "").replace(/\s+/g, "").replace(/%$/, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN; const n = +s; return neg ? -n : n; };
const fxS = (v) => FXB(v) ? "" : typeof v === "number" ? String(+v.toPrecision(12)) : String(v);
const fxCell = (v) => { if (FXB(v)) return null; if (typeof v === "number") return v; const n = fxNum(v); return isFinite(n) ? n : String(v).trim() === "" ? null : String(v).trim(); };
const fxTruth = (v) => { if (FXB(v)) return NaN; if (typeof v === "number") return v !== 0 ? 1 : 0; const s = String(v).trim().toLowerCase(); if (["false", "no", "n", "0"].includes(s)) return 0; return s ? 1 : NaN; };
const fxKey = (v) => FXB(v) ? "" : typeof v === "number" ? String(v) : (() => { const n = fxNum(v); return isFinite(n) ? String(n) : String(v).trim().toLowerCase(); })();
// dates → day number (days since 1970-01-01, UTC)
const FX_MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
const fxDay = (y, m, d) => { const t = Date.UTC(y, m - 1, d); if (!isFinite(t)) return NaN; const dt = new Date(t); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t / 864e5 : NaN; };
const _fxDC = new Map();
const fxDate = (v) => { if (FXB(v)) return NaN; if (typeof v === "number") { if (Number.isInteger(v) && v >= 1800 && v <= 2200) return fxDay(v, 1, 1); if (v > 3000 && v < 80000) return Math.round(v) - 25569; return NaN; }
  const s = String(v).trim(); let r = _fxDC.get(s); if (r !== undefined) return r; if (_fxDC.size > 200000) _fxDC.clear(); let m; r = NaN; const mon = (x) => FX_MON[x.slice(0, 4).toLowerCase()] || FX_MON[x.slice(0, 3).toLowerCase()];
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))) r = fxDay(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) r = fxDay(+m[3], +m[1], +m[2]);
  else if ((m = s.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/))) r = fxDay(+m[3], +m[2], +m[1]);
  else if ((m = s.match(/^(\d{4})\s*[-/M]\s*(\d{1,2})$/))) r = fxDay(+m[1], +m[2], 1);
  else if ((m = s.match(/^(\d{4})\s*[-_ ]?\s*Q([1-4])$/i))) r = fxDay(+m[1], +m[2] * 3 - 2, 1);
  else if ((m = s.match(/^(\d{4})(?:\.0)?$/))) r = +m[1] >= 1800 && +m[1] <= 2200 ? fxDay(+m[1], 1, 1) : NaN;
  else if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/)) && mon(m[2])) r = fxDay(+m[3], mon(m[2]), +m[1]);
  else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)) && mon(m[1])) r = fxDay(+m[3], mon(m[1]), +m[2]);
  else if ((m = s.match(/^([A-Za-z]{3,9})\.?[\s-]+(\d{4})$/)) && mon(m[1])) r = fxDay(+m[2], mon(m[1]), 1);
  else if (/^\d{5}(\.\d+)?$/.test(s)) r = Math.round(+s) - 25569;
  _fxDC.set(s, r); return r; };
const fxYMD = (day) => { const d = new Date(day * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() }; };
const fxISO = (day) => { if (!isFinite(day)) return null; const p = fxYMD(day); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
const FX_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], FX_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const fxAddMonths = (day, k) => { const p = fxYMD(day); const t = p.y * 12 + (p.m - 1) + k; const y = Math.floor(t / 12), m = t - y * 12 + 1; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return fxDay(y, m, Math.min(p.d, last)); };
const fxMonthsBetween = (a, b) => { const p = fxYMD(a), q = fxYMD(b); let mm = (q.y - p.y) * 12 + (q.m - p.m); if (b >= a) { if (q.d < p.d) mm--; } else if (q.d > p.d) mm++; return mm; };
const fxFmtDate = (day, pat) => { if (!isFinite(day)) return null; const p = fxYMD(day); return String(pat).replace(/YYYY|yyyy|YY|yy|MMMM|mmmm|MMM|mmm|MM|mm|M|m|DDDD|dddd|DDD|ddd|DD|dd|D|d/g, t => { const k = t.toUpperCase();
  return k === "YYYY" ? String(p.y) : k === "YY" ? String(p.y).slice(2) : k === "MMMM" ? FX_MONTHS[p.m - 1] : k === "MMM" ? FX_MONTHS[p.m - 1].slice(0, 3) : k === "MM" ? String(p.m).padStart(2, "0") : k === "M" ? String(p.m) : k === "DDDD" ? FX_DAYS[p.w] : k === "DDD" ? FX_DAYS[p.w].slice(0, 3) : k === "DD" ? String(p.d).padStart(2, "0") : String(p.d); }); };
const fxRound = (x, d, mode) => { if (!isFinite(x)) return NaN; d = Math.round(d || 0); const a = Math.abs(x); const sh = (v, k) => { const [m, e] = String(v).split("e"); return Number(m + "e" + ((+e || 0) + k)); };
  const z = sh(a, d); const r = mode === "up" ? Math.ceil(+(z.toPrecision(15))) : mode === "down" ? Math.floor(+(z.toPrecision(15))) : Math.round(+(z.toPrecision(15))); return Math.sign(x) * sh(r, -d); };
const fxFmtNum = (x, d, sep = true) => { if (!isFinite(x)) return null; const r = fxRound(x, d); return r.toLocaleString("en-US", { minimumFractionDigits: Math.max(0, d), maximumFractionDigits: Math.max(0, d), useGrouping: sep }); };
// Excel criteria such as ">=5", "<>Ghana", "Gh*"
const fxCrit = (c) => { if (FXB(c)) return (v) => FXB(v); let op = "=", val = c; if (typeof c === "string") { const m = c.match(/^\s*(>=|<=|<>|!=|>|<|==|=)(.*)$/); if (m) { op = m[1] === "!=" ? "<>" : m[1] === "==" ? "=" : m[1]; val = m[2]; } }
  const vn = fxNum(val);
  if (op === "=" || op === "<>") { let test; if (isFinite(vn)) test = (v) => fxNum(v) === vn; else { const t = String(val).trim().toLowerCase(); if (/[*?]/.test(t)) { const re = new RegExp("^" + t.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i"); test = (v) => re.test(fxS(v)); } else test = (v) => t === "" ? FXB(v) : fxS(v).trim().toLowerCase() === t; } return op === "=" ? test : (v) => !test(v); }
  return (v) => { const x = fxNum(v); if (!isFinite(x) || !isFinite(vn)) return false; return op === ">" ? x > vn : op === "<" ? x < vn : op === ">=" ? x >= vn : x <= vn; }; };
const fxPlainCrit = (c) => !(typeof c === "string" && /^\s*(>=|<=|<>|!=|>|<|==|=)|[*?]/.test(c));
const fxTokenize = (src) => { const t = []; let i = 0; const s = src;
  while (i < s.length) { const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.eE]/.test(s[j])) { if (/[eE]/.test(s[j]) && /[+-]/.test(s[j + 1])) j++; j++; } const v = parseFloat(s.slice(i, j)); if (!isFinite(v)) throw new Error(`Bad number "${s.slice(i, j)}"`); t.push({ k: "num", v }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++; t.push({ k: "id", v: s.slice(i, j) }); i = j; continue; }
    if (c === "`" || c === "[") { const close = c === "`" ? "`" : "]"; const j = s.indexOf(close, i + 1); if (j < 0) throw new Error(`Missing closing ${close}`); t.push({ k: "id", v: s.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === '"' || c === "'" || c === "“" || c === "”" || c === "‘" || c === "’" || c === "´") { const cl = FX_Q[c]; let j = s.indexOf(cl, i + 1); if (j < 0) j = s.indexOf(c, i + 1); if (j < 0) throw new Error("A quote is not closed. Text goes between two quotes, like \"West\"."); t.push({ k: "str", v: s.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === ":") throw new Error("Cell ranges like A2:A10 are not used here. Write the column name instead, for example column_total(sales).");
    const two = s.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||", "<>"].includes(two)) { t.push({ k: "op", v: two === "<>" ? "!=" : two }); i += 2; continue; }
    if (c === ";") { t.push({ k: "op", v: "," }); i++; continue; }
    if ("+-*/^(),<>=!%&".includes(c)) { t.push({ k: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`); }
  return t; };
// Pratt parser → AST
const fxParse = (src) => { const t = fxTokenize(src); let p = 0; const peek = () => t[p]; const eat = (v) => { const x = t[p]; if (!x || (v && x.v !== v)) throw new Error(v ? `Expected "${v}"${x ? ` but found "${x.v}"` : " at the end (a bracket may be missing)"}` : "The formula ends too early"); p++; return x; };
  const BP = { "or": 1, "||": 1, "and": 2, "&&": 2, "==": 3, "=": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "&": 4.5, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 8 };
  const prefix = () => { const x = eat(); if (x.k === "num") return { t: "num", v: x.v }; if (x.k === "str") return { t: "str", v: x.v };
    if (x.k === "op" && x.v === "(") { const e = expr(0); eat(")"); return e; }
    if (x.k === "op" && (x.v === "-" || x.v === "+")) return { t: "neg", s: x.v, a: expr(7) };
    if (x.k === "op" && x.v === "!") return { t: "not", a: expr(7) };
    if (x.k === "id") { const lw = x.v.toLowerCase(); if (lw === "not" && !(peek() && peek().v === "(" )) return { t: "not", a: expr(7) }; if (lw === "true") return { t: "num", v: 1 }; if (lw === "false") return { t: "num", v: 0 }; if (lw === "na" || lw === "null" || lw === "blank") return { t: "num", v: NaN };
      if (peek() && peek().v === "(") { eat("("); const args = []; if (peek() && peek().v !== ")") { args.push(expr(0)); while (peek() && peek().v === ",") { eat(","); args.push(expr(0)); } } eat(")");
        if (lw === "not") { if (args.length !== 1) throw new Error("not() takes 1 value"); return { t: "not", a: args[0] }; }
        const F = fxFuncName(x.v);
        if (!F) { if (FX_NOT_HERE[lw]) throw new Error(`${x.v.toUpperCase()} is not used here. Use ${FX_NOT_HERE[lw]}.`); const sg = fxSuggest(x.v); throw new Error(`Unknown function "${x.v}".${sg.length ? ` Did you mean ${sg.map(s => s + "()").join(" or ")}?` : ""} Search the list on the right for what you need.`); }
        const f = FX_FUNCS[F]; if (args.length < f.n[0] || args.length > f.n[1]) throw new Error(`${x.v}() takes ${f.n[0] === f.n[1] ? f.n[0] : f.n[1] >= 200 ? `${f.n[0]} or more` : `${f.n[0]} to ${f.n[1]}`} value${f.n[1] === 1 ? "" : "s"}, not ${args.length}.${f.ex ? ` Example: ${f.ex}` : ""}`);
        return { t: "fn", f: F, args, raw: x.v }; }
      return { t: "col", v: x.v }; }
    throw new Error(x.v === ")" ? "There is a closing bracket without an opening one, or a value is missing" : `Unexpected "${x.v}"`); };
  const expr = (rbp) => { let l = prefix(); for (;;) { const x = peek(); if (!x) break; const op = x.k === "id" ? x.v.toLowerCase() : x.v; const bp = BP[op]; if (!bp || bp <= rbp || (x.k === "id" && !["and", "or"].includes(op))) break; p++; const r = expr(op === "^" ? bp - 1 : bp); l = { t: "bin", op, l, r }; } return l; };
  const e = expr(0); if (p < t.length) throw new Error(t[p].v === ")" ? "There is one closing bracket too many" : `Unexpected "${t[p].v}". Is an operator (+, *, &, and) or a comma missing?`); return e; };
// Split "name = expression" (first single "=" that is not part of ==, <=, >=, !=)
const FX_Q = { "`": "`", '"': '"', "'": "'", "´": "´", "‘": "’", "’": "’", "“": "”", "”": "”", "[": "]" };
const fxSplit = (line) => { let q = null, at = -1; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === q) q = null; continue; } if (FX_Q[c]) { q = FX_Q[c]; continue; }
    if (c === "=" && line[i + 1] !== "=" && !"<>!=".includes(line[i - 1] || "")) { at = i; break; } }
  if (at < 0) return null; let name = line.slice(0, at).trim(); const expr = line.slice(at + 1).trim().replace(/^=\s*/, "");
  const open = name[0]; if (FX_Q[open] && name.endsWith(FX_Q[open]) && name.length > 1) name = name.slice(1, -1).trim();
  if (!name || /^[0-9]/.test(name) && /^[0-9.]+$/.test(name)) return null; if (/[(]/.test(name) && /^[A-Za-z_][A-Za-z0-9_.]*\(/.test(name) && /\)\s*$/.test(name) && !/[_\-]\(|\([^)]*[-_ ]/.test(name) && FX_FUNCS[fxFuncName(name.split("(")[0]) || ""]) return null;
  return { name, expr }; };
// Evaluate one AST over the table. ctx: {cols:{name:[values]}, n, groups:[[rowIdx in time order]], datasets }
const fxEval = (ast, ctx) => { const n = ctx.n;
  const vec = (x) => Array.isArray(x) ? x : new Array(n).fill(x);
  const mapG = (arr, fn) => { const out = new Array(n).fill(NaN); ctx.groups.forEach(g => { const vals = g.map(i => arr[i]); const res = fn(vals, g); g.forEach((i, q) => out[i] = Array.isArray(res) ? res[q] : res); }); return out; };
  const nums = (a) => { const o = []; for (const v of a) { const x = fxNum(v); if (isFinite(x)) o.push(x); } return o; };
  const S = { mean: (a) => { const f = nums(a); return f.length ? f.reduce((s, v) => s + v, 0) / f.length : NaN; }, sum: (a) => nums(a).reduce((s, v) => s + v, 0), count: (a) => nums(a).length, filled: (a) => a.filter(v => !FXB(v)).length,
    sd: (a) => { const f = nums(a); if (f.length < 2) return NaN; const m = f.reduce((s, v) => s + v, 0) / f.length; return Math.sqrt(f.reduce((s, v) => s + (v - m) ** 2, 0) / (f.length - 1)); },
    var: (a) => { const s = S.sd(a); return s * s; }, median: (a) => S.pct(a, 0.5), min: (a) => { const f = nums(a); return f.length ? Math.min(...f) : NaN; }, max: (a) => { const f = nums(a); return f.length ? Math.max(...f) : NaN; },
    pct: (a, q) => { const f = nums(a).sort((x, y) => x - y); if (!f.length || !(q >= 0 && q <= 1)) return NaN; const h = (f.length - 1) * q, lo = Math.floor(h); return f[lo] + (f[Math.min(lo + 1, f.length - 1)] - f[lo]) * (h - lo); },
    product: (a) => { const f = nums(a); return f.length ? f.reduce((s, v) => s * v, 1) : NaN; } };
  const colRaw = (name) => { if (name in ctx.cols) return ctx.cols[name]; const hit = Object.keys(ctx.cols).find(k => k.toLowerCase() === String(name).toLowerCase()); if (hit) return ctx.cols[hit];
    if (/^[A-Z]{1,3}\d+$/i.test(name)) throw new Error(`"${name}" looks like a cell reference. Here you write the column name instead (for example gdp), and the formula works on every row.`);
    const close = Object.keys(ctx.cols).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, "") === String(name).toLowerCase().replace(/[^a-z0-9]/g, ""));
    throw new Error(`No column called "${name}".${close ? ` Did you mean [${close}]?` : " Click a column name above the box to insert it exactly."}`); };
  const nameOf = (a) => a.t === "col" ? a.v : a.t === "str" ? a.v : null;
  const asCol = (a) => a && a.t === "str" && /[0-9_()\[\]\-]/.test(a.v) && (a.v in ctx.cols) ? { t: "strcol", v: a.v } : a;
  const ev = (a) => { switch (a.t) {
    case "num": return a.v; case "str": return a.v;
    case "strcol": return colRaw(a.v).map(fxCell);
    case "col": return colRaw(a.v).map(fxCell);
    case "neg": { const v = vec(ev(a.a)); return a.s === "-" ? v.map(x => { const y = fxNum(x); return isFinite(y) ? -y : NaN; }) : v.map(fxNum); }
    case "not": return vec(ev(a.a)).map(x => { const t = fxTruth(x); return isFinite(t) ? 1 - t : NaN; });
    case "bin": { const cmp = ["==", "=", "!=", "<", ">", "<=", ">="].includes(a.op); const l = vec(ev(cmp ? a.l : asCol(a.l))), r = vec(ev(cmp ? a.r : asCol(a.r))); const op = a.op;
      if (op === "&") return l.map((x, i) => fxS(x) + fxS(r[i]));
      if (["and", "&&", "or", "||"].includes(op)) { const isAnd = op === "and" || op === "&&"; return l.map((x, i) => { const p = fxTruth(x), q = fxTruth(r[i]); if (isAnd) { if (p === 0 || q === 0) return 0; return isFinite(p) && isFinite(q) ? 1 : NaN; } if (p === 1 || q === 1) return 1; return isFinite(p) && isFinite(q) ? 0 : NaN; }); }
      if (["==", "=", "!=", "<", ">", "<=", ">="].includes(op)) return l.map((x, i) => { const y = r[i]; const eq = op === "==" || op === "=", ne = op === "!=";
        if (FXB(x) || FXB(y)) { if (eq) return +(FXB(x) && FXB(y)); if (ne) return +!(FXB(x) && FXB(y)); return NaN; }
        const nx = fxNum(x), ny = fxNum(y); let c;
        if (isFinite(nx) && isFinite(ny)) c = nx < ny ? -1 : nx > ny ? 1 : 0;
        else { const dx = fxDate(x), dy = fxDate(y); if (!eq && !ne && isFinite(dx) && isFinite(dy)) c = dx < dy ? -1 : dx > dy ? 1 : 0; else { const sx = fxS(x).trim().toLowerCase(), sy = fxS(y).trim().toLowerCase(); c = sx === sy ? 0 : (eq || ne) ? 1 : sx.localeCompare(sy, undefined, { numeric: true }); } }
        return +(eq ? c === 0 : ne ? c !== 0 : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0); });
      const f = { "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y, "/": (x, y) => y === 0 ? NaN : x / y, "%": (x, y) => y === 0 ? NaN : x % y, "^": (x, y) => Math.pow(x, y) }[op];
      return l.map((x, i) => { const p = fxNum(x), q = fxNum(r[i]); return isFinite(p) && isFinite(q) ? f(p, q) : NaN; }); }
    case "fn": return fxCall(a);
    default: throw new Error("Bad expression"); } };
  const fxCall = (a) => { const F = a.f, A = a.args.map(x => ["look_up_from", "join_text", "join_with", "TEXTJOIN", "in_list", "match_value", "first_true", "IFS", "if", "pick_by_number", "TEXT", "format_date", "replace_text", "contains", "starts_with", "ends_with", "position_of", "text_before", "text_after", "split_part", "if_blank", "DATEDIF", "XLOOKUP", "look_up"].includes(a.f) ? x : asCol(x)); const V = (j) => vec(ev(A[j])); const has = (j) => A.length > j; const K = (j, def) => { if (!has(j)) return def; const v = ev(A[j]); return Array.isArray(v) ? v.map(fxNum) : fxNum(v); };
    const KS = (j, def) => { const v = K(j, def); return Array.isArray(v) ? v : new Array(n).fill(v); };
    const num1 = (f) => V(0).map(v => { const x = fxNum(v); if (!isFinite(x)) return NaN; const y = f(x); return isFinite(y) ? y : NaN; });
    const num2 = (f, defB) => { const x = V(0), y = has(1) ? KS(1) : new Array(n).fill(defB); return x.map((v, i) => { const p = fxNum(v), q = y[i]; if (!isFinite(p) || !isFinite(q)) return NaN; const r = f(p, q); return isFinite(r) ? r : NaN; }); };
    const txt = (f) => V(0).map(v => FXB(v) ? null : f(fxS(v)));
    const rows = (fn, from = 0) => { const vs = A.slice(from).map((_, j) => V(j + from)); return Array.from({ length: n }, (_, i) => fn(vs.map(v => v[i]), i)); };
    const dates = (j) => V(j).map(fxDate);
    const colStat = (f) => mapG(V(0), vs => f(vs));
    const series = (fn) => mapG(V(0).map(fxNum), vs => fn(vs));
    const condAgg = (vals, cond, how) => { const c = cond.map(fxTruth); return mapG(vals.map((v, i) => c[i] === 1 ? v : NaN), vs => S[how](vs)); };
    const forEach = (vals, keys, how) => { const m = new Map(); keys.forEach((k, i) => { const kk = fxKey(k); if (!m.has(kk)) m.set(kk, []); m.get(kk).push(vals ? vals[i] : 1); }); const out = new Map(); m.forEach((vs, k) => out.set(k, how === "rows" ? vs.length : S[how](vs))); return keys.map(k => out.get(fxKey(k))); };
    // Excel-style conditional: pairs of (range, criteria); criteria may differ row by row
    const ifs = (vals, pairs, how) => { const scal = pairs.filter(p => !Array.isArray(p.c)); const vecs = pairs.filter(p => Array.isArray(p.c)); const tests = scal.map(p => ({ r: p.r, t: fxCrit(p.c) }));
      const okRow = (j) => tests.every(x => x.t(x.r[j]));
      if (!vecs.length) { const keep = []; for (let j = 0; j < n; j++) if (okRow(j)) keep.push(vals ? vals[j] : 1); const v = how === "rows" ? keep.length : S[how](keep); return new Array(n).fill(v); }
      if (vecs.every(p => p.c.every(fxPlainCrit))) { const m = new Map(); for (let j = 0; j < n; j++) { if (!okRow(j)) continue; const k = vecs.map(p => fxKey(p.r[j])).join("\u0001"); if (!m.has(k)) m.set(k, []); m.get(k).push(vals ? vals[j] : 1); }
        const out = new Map(); m.forEach((vs, k) => out.set(k, how === "rows" ? vs.length : S[how](vs))); return Array.from({ length: n }, (_, i) => { const k = vecs.map(p => fxKey(p.c[i])).join("\u0001"); const v = out.get(k); return v == null ? (how === "rows" || how === "sum" ? 0 : NaN) : v; }); }
      if (n > 4000) throw new Error("Conditions that change from row to row (like \">\" & column) work on tables up to 4,000 rows. Use total_if(values, condition) or total_for_each(values, group) instead.");
      return Array.from({ length: n }, (_, i) => { const t2 = vecs.map(p => ({ r: p.r, t: fxCrit(p.c[i]) })); const keep = []; for (let j = 0; j < n; j++) if (okRow(j) && t2.every(x => x.t(x.r[j]))) keep.push(vals ? vals[j] : 1); return how === "rows" ? keep.length : S[how](keep); }); };
    const critArg = (j) => { const v = ev(A[j]); return v; };
    const pairsFrom = (start) => { const out = []; for (let j = start; j + 1 < A.length; j += 2) out.push({ r: V(j), c: critArg(j + 1) }); return out; };
    const fit = (y, x) => { const Y = y.map(fxNum), X = x.map(fxNum); const pts = []; for (let i = 0; i < Y.length; i++) if (isFinite(Y[i]) && isFinite(X[i])) pts.push([X[i], Y[i]]); const k = pts.length; if (k < 2) return null;
      let mx = 0, my = 0; for (const [p, q] of pts) { mx += p; my += q; } mx /= k; my /= k; let sxx = 0, sxy = 0, syy = 0; for (const [p, q] of pts) { const dx = p - mx, dy = q - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; } if (!sxx) return null;
      const b = sxy / sxx; return { a: my - b * mx, b, r: syy ? sxy / Math.sqrt(sxx * syy) : NaN, cov: sxy / (k - 1) }; };
    const pairStat = (f) => { const y = V(0), x = V(1); return mapG(y.map((v, i) => [v, x[i]]), ps => { const r = fit(ps.map(p => p[0]), ps.map(p => p[1])); return r ? f(r, ps) : NaN; }); };
    const lookupMap = (keys, vals) => { const m = new Map(); keys.forEach((k, i) => { const kk = fxKey(k); if (kk !== "" && !m.has(kk)) m.set(kk, vals[i]); }); return m; };
    const pmt = (r, nper, pv, fv = 0, type = 0) => r === 0 ? -(pv + fv) / nper : -(r * (pv * Math.pow(1 + r, nper) + fv)) / ((1 + r * type) * (Math.pow(1 + r, nper) - 1));
    const fvf = (r, nper, pm, pv = 0, type = 0) => r === 0 ? -(pv + pm * nper) : -(pv * Math.pow(1 + r, nper) + pm * (1 + r * type) * (Math.pow(1 + r, nper) - 1) / r);
    const pvf = (r, nper, pm, fv = 0, type = 0) => r === 0 ? -(fv + pm * nper) : -(fv + pm * (1 + r * type) * (Math.pow(1 + r, nper) - 1) / r) / Math.pow(1 + r, nper);
    const nperf = (r, pm, pv, fv = 0, type = 0) => r === 0 ? -(pv + fv) / pm : Math.log((pm * (1 + r * type) - fv * r) / (pm * (1 + r * type) + pv * r)) / Math.log(1 + r);
    const ratef = (nper, pm, pv, fv = 0, type = 0, g = 0.1) => { let r = g; for (let it = 0; it < 100; it++) { const f = fvf(r, nper, pm, pv, type) - fv; const h = 1e-6; const d = (fvf(r + h, nper, pm, pv, type) - fv - f) / h; if (!isFinite(d) || d === 0) break; const nr = r - f / d; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } return Math.abs(fvf(r, nper, pm, pv, type) - fv) < 1e-6 ? r : NaN; };
    const irr = (cf) => { if (cf.length < 2 || !cf.some(v => v < 0) || !cf.some(v => v > 0)) return NaN; const npv = (r) => cf.reduce((s, v, t) => s + v / Math.pow(1 + r, t), 0); let lo = -0.9999, hi = 10; if (npv(lo) * npv(hi) > 0) return NaN; for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; if (hi - lo < 1e-12) break; } return (lo + hi) / 2; };
    switch (F) {
      // maths
      case "round_to": return num2((x, d) => fxRound(x, d), 0);
      case "round_up": return num2((x, d) => fxRound(x, d, "up"), 0);
      case "round_down": return num2((x, d) => fxRound(x, d, "down"), 0);
      case "round_to_multiple": return num2((x, m) => m === 0 ? 0 : fxRound(x / m, 0) * m);
      case "round_up_to_multiple": return num2((x, m) => m === 0 ? 0 : Math.ceil(+(x / m).toPrecision(15)) * m, 1);
      case "round_down_to_multiple": return num2((x, m) => m === 0 ? 0 : Math.floor(+(x / m).toPrecision(15)) * m, 1);
      case "whole_number": return num1(Math.floor);
      case "remainder": return num2((x, d) => d === 0 ? NaN : x - d * Math.floor(x / d));
      case "divide": { const x = V(0).map(fxNum), y = V(1).map(fxNum), z = has(2) ? V(2) : null; return x.map((p, i) => isFinite(p) && isFinite(y[i]) && y[i] !== 0 ? p / y[i] : z ? z[i] : NaN); }
      case "percent_of": return num2((p, w) => w === 0 ? NaN : p / w * 100);
      case "percent_change": return num2((nw, od) => od === 0 ? NaN : (nw - od) / Math.abs(od) * 100);
      case "power": return num2(Math.pow);
      case "square_root": return num1(Math.sqrt);
      case "absolute": return num1(Math.abs);
      case "sign_of": return num1(Math.sign);
      case "log": return has(1) ? num2((x, b) => Math.log(x) / Math.log(b)) : num1(Math.log);
      case "ln": return num1(Math.log); case "log10": return num1(Math.log10); case "exp": return num1(Math.exp);
      case "pi": return Math.PI;
      case "factorial": return num1(x => { if (x < 0 || x > 170) return NaN; let f = 1; for (let k = 2; k <= Math.floor(x); k++) f *= k; return f; });
      case "random_number": return Array.from({ length: n }, () => Math.random());
      case "random_between": { const lo = KS(0), hi = KS(1); return lo.map((l, i) => isFinite(l) && isFinite(hi[i]) ? Math.floor(Math.ceil(l) + Math.random() * (Math.floor(hi[i]) - Math.ceil(l) + 1)) : NaN); }
      // across columns
      case "average_across": return rows(v => S.mean(v)); case "total_across": return rows(v => nums(v).length ? S.sum(v) : NaN); case "count_across": return rows(v => S.filled(v));
      case "count_blank_across": return rows(v => v.filter(FXB).length); case "smallest_across": return rows(v => S.min(v)); case "largest_across": return rows(v => S.max(v));
      case "median_across": return rows(v => S.median(v)); case "spread_across": return rows(v => S.sd(v)); case "product_across": return rows(v => S.product(v));
      case "slope_across": case "r_squared_across": return rows(v => { const ys = [], xs = []; v.forEach((x, k) => { const y = fxNum(x); if (isFinite(y)) { ys.push(y); xs.push(k + 1); } }); const r = fit(ys, xs); return r ? (F === "slope_across" ? r.b : r.r * r.r) : NaN; });
      case "slope_against_names": case "r_squared_against_names": { const xs = A.map(x => { const nm = x.t === "col" ? x.v : x.t === "str" ? x.v : null; const m2 = nm && String(nm).match(/-?\d+(\.\d+)?/); return m2 ? +m2[0] : NaN; });
        if (xs.filter(isFinite).length < 2) throw new Error("The column names need numbers in them, like 2013 or y2013. Write the columns as [2013], [2014], … or y2013, y2014, …");
        const cols = A.map((_, j) => V(j)); return Array.from({ length: n }, (_, i) => { const ys = [], xx = []; cols.forEach((c, j) => { const y = fxNum(c[i]); if (isFinite(y) && isFinite(xs[j])) { ys.push(y); xx.push(xs[j]); } }); const r = fit(ys, xx); return r ? (F === "slope_against_names" ? r.b : r.r * r.r) : NaN; }); }
      case "slope_against_row": case "r_squared_against_row": { const rn = Math.round(KS(0)[0]); if (!(rn >= 1 && rn <= n)) throw new Error(`Row ${KS(0)[0]} does not exist. The table has ${n} rows; the first is row 1.`);
        const cols = A.slice(1).map((_, j) => V(j + 1)); const xs = cols.map(c => fxNum(c[rn - 1])); if (xs.filter(isFinite).length < 2) throw new Error(`Row ${rn} needs numbers (like years) in at least two of these columns.`);
        return Array.from({ length: n }, (_, i) => { const ys = [], xx = []; cols.forEach((c, j) => { const y = fxNum(c[i]); if (isFinite(y) && isFinite(xs[j])) { ys.push(y); xx.push(xs[j]); } }); const r = fit(ys, xx); return r ? (F === "slope_against_row" ? r.b : r.r * r.r) : NaN; }); }
      case "first_filled": return rows(v => { for (const x of v) if (!FXB(x)) return x; return null; });
      // Excel names that mean "whole column" with one argument and "across" with several
      case "AVERAGE": return A.length > 1 ? rows(v => S.mean(v)) : colStat(S.mean);
      case "SUM": return A.length > 1 ? rows(v => S.sum(v)) : colStat(S.sum);
      case "MIN": return A.length > 1 ? rows(v => S.min(v)) : colStat(S.min);
      case "MAX": return A.length > 1 ? rows(v => S.max(v)) : colStat(S.max);
      case "MEDIAN": return A.length > 1 ? rows(v => S.median(v)) : colStat(S.median);
      case "COUNT": return A.length > 1 ? rows(v => nums(v).length) : colStat(S.count);
      case "COUNTA": return A.length > 1 ? rows(v => S.filled(v)) : colStat(S.filled);
      case "STDEV": return A.length > 1 ? rows(v => S.sd(v)) : colStat(S.sd);
      // whole column
      case "column_average": return colStat(S.mean); case "column_total": return colStat(S.sum); case "column_count": return colStat(S.count); case "column_count_filled": return colStat(S.filled);
      case "count_distinct": return colStat(vs => new Set(vs.filter(v => !FXB(v)).map(fxKey)).size);
      case "column_median": return colStat(S.median); case "column_min": return colStat(S.min); case "column_max": return colStat(S.max); case "column_sd": return colStat(S.sd); case "column_variance": return colStat(S.var);
      case "column_percentile": { const p = K(1); const q = Array.isArray(p) ? p[0] : p; return colStat(vs => S.pct(vs, q / 100)); }
      case "PERCENTILE": { const p = K(1); const q = Array.isArray(p) ? p[0] : p; return colStat(vs => S.pct(vs, q)); }
      case "column_quartile": { const p = K(1); const q = Array.isArray(p) ? p[0] : p; return colStat(vs => S.pct(vs, q / 4)); }
      case "column_mode": return colStat(vs => { const c = new Map(); let best = null, bc = 0; vs.forEach(v => { if (FXB(v)) return; const k = fxKey(v); const x = (c.get(k) || 0) + 1; c.set(k, x); if (x > bc) { bc = x; best = v; } }); return best; });
      case "rank_in_column": case "RANK": { const ordRaw = has(1) ? ev(A[1]) : (F === "RANK" ? 0 : "largest"); const o = Array.isArray(ordRaw) ? ordRaw[0] : ordRaw; const asc = /small|asc|low|^1$/i.test(String(o));
        if (F === "RANK" && has(1) && Array.isArray(ev(A[1]))) { const x = V(0).map(fxNum), ref = V(1).map(fxNum).filter(isFinite); const asc2 = has(2) && fxNum(Array.isArray(ev(A[2])) ? ev(A[2])[0] : ev(A[2])) === 1; return x.map(v => isFinite(v) ? 1 + ref.filter(r => asc2 ? r < v : r > v).length : NaN); }
        return mapG(V(0).map(fxNum), vs => vs.map(v => isFinite(v) ? 1 + vs.filter(r => isFinite(r) && (asc ? r < v : r > v)).length : NaN)); }
      case "percent_rank": case "PERCENTRANK": { const sc = F === "percent_rank" ? 100 : 1; if (F === "PERCENTRANK") { const ref = V(0).map(fxNum).filter(isFinite), x = V(1).map(fxNum); return x.map(v => isFinite(v) && ref.length > 1 ? ref.filter(r => r < v).length / (ref.length - 1) : NaN); }
        return mapG(V(0).map(fxNum), vs => { const f = vs.filter(isFinite); return vs.map(v => isFinite(v) && f.length > 1 ? f.filter(r => r < v).length / (f.length - 1) * sc : NaN); }); }
      case "standardise": return mapG(V(0), vs => { const m = S.mean(vs), s = S.sd(vs); return vs.map(v => { const x = fxNum(v); return isFinite(x) && s > 0 ? (x - m) / s : NaN; }); });
      case "STANDARDIZE": { const x = V(0).map(fxNum), m = KS(1), s = KS(2); return x.map((v, i) => isFinite(v) && s[i] > 0 ? (v - m[i]) / s[i] : NaN); }
      case "rescale_0_100": return mapG(V(0), vs => { const lo = S.min(vs), hi = S.max(vs); return vs.map(v => { const x = fxNum(v); return isFinite(x) && hi > lo ? (x - lo) / (hi - lo) * 100 : NaN; }); });
      case "share_of_total": return mapG(V(0), vs => { const s = S.sum(vs); return vs.map(v => { const x = fxNum(v); return isFinite(x) && s ? x / s * 100 : NaN; }); });
      case "correlation": return pairStat(r => r.r); case "covariance": return pairStat(r => r.cov); case "slope": return pairStat(r => r.b); case "intercept": return pairStat(r => r.a); case "r_squared": return pairStat(r => r.r * r.r);
      case "trend_value": { const y = V(0), x = V(1); return mapG(y.map((v, i) => [v, x[i]]), ps => { const r = fit(ps.map(p => p[0]), ps.map(p => p[1])); return ps.map(p => { const xv = fxNum(p[1]); return r && isFinite(xv) ? r.a + r.b * xv : NaN; }); }); }
      // conditional (plain)
      case "total_if": return condAgg(V(0), V(1), "sum"); case "average_if": return condAgg(V(0), V(1), "mean"); case "largest_if": return condAgg(V(0), V(1), "max"); case "smallest_if": return condAgg(V(0), V(1), "min");
      case "count_if": { const c = V(0).map(fxTruth); return mapG(c, vs => vs.filter(v => v === 1).length); }
      case "total_for_each": return forEach(V(0), V(1), "sum"); case "average_for_each": return forEach(V(0), V(1), "mean"); case "largest_for_each": return forEach(V(0), V(1), "max"); case "smallest_for_each": return forEach(V(0), V(1), "min");
      case "count_for_each": return forEach(null, V(0), "rows");
      // conditional (Excel)
      case "SUMIF": return ifs(has(2) ? V(2) : V(0), [{ r: V(0), c: critArg(1) }], "sum");
      case "AVERAGEIF": return ifs(has(2) ? V(2) : V(0), [{ r: V(0), c: critArg(1) }], "mean");
      case "COUNTIF": return ifs(null, [{ r: V(0), c: critArg(1) }], "rows");
      case "SUMIFS": return ifs(V(0), pairsFrom(1), "sum"); case "AVERAGEIFS": return ifs(V(0), pairsFrom(1), "mean"); case "MAXIFS": return ifs(V(0), pairsFrom(1), "max"); case "MINIFS": return ifs(V(0), pairsFrom(1), "min");
      case "COUNTIFS": return ifs(null, pairsFrom(0), "rows");
      // logic
      case "if": { const c = V(0).map(fxTruth), x = V(1), y = has(2) ? V(2) : new Array(n).fill(0); return c.map((v, i) => !isFinite(v) ? null : v ? x[i] : y[i]); }
      case "first_true": case "IFS": { const vs = A.map((_, j) => V(j)); const hasDef = A.length % 2 === 1; return Array.from({ length: n }, (_, i) => { for (let j = 0; j + 1 < vs.length; j += 2) { if (fxTruth(vs[j][i]) === 1) return vs[j + 1][i]; } return hasDef ? vs[vs.length - 1][i] : null; }); }
      case "match_value": { const vs = A.map((_, j) => V(j)); const hasDef = (A.length - 1) % 2 === 1; return Array.from({ length: n }, (_, i) => { const x = fxKey(vs[0][i]); for (let j = 1; j + 1 < vs.length; j += 2) if (fxKey(vs[j][i]) === x) return vs[j + 1][i]; return hasDef ? vs[vs.length - 1][i] : null; }); }
      case "pick_by_number": { const vs = A.map((_, j) => V(j)); return Array.from({ length: n }, (_, i) => { const k = Math.floor(fxNum(vs[0][i])); return k >= 1 && k < vs.length ? vs[k][i] : null; }); }
      case "all_true": return rows(v => { const t = v.map(fxTruth); return t.some(x => x === 0) ? 0 : t.every(isFinite) ? 1 : NaN; });
      case "any_true": return rows(v => { const t = v.map(fxTruth); return t.some(x => x === 1) ? 1 : t.every(isFinite) ? 0 : NaN; });
      case "only_one_true": return rows(v => { const t = v.map(fxTruth); if (!t.every(isFinite)) return NaN; return t.filter(x => x === 1).length % 2; });
      case "between": { const x = V(0), lo = V(1), hi = V(2); return x.map((v, i) => { const p = fxNum(v), a2 = fxNum(lo[i]), b2 = fxNum(hi[i]); if (isFinite(p) && isFinite(a2) && isFinite(b2)) return +(p >= Math.min(a2, b2) && p <= Math.max(a2, b2)); const d = fxDate(v), da = fxDate(lo[i]), db = fxDate(hi[i]); return isFinite(d) && isFinite(da) && isFinite(db) ? +(d >= da && d <= db) : NaN; }); }
      case "in_list": { const x = V(0); const want = new Set(A.slice(1).flatMap(z => { const v = ev(z); return Array.isArray(v) ? [] : [fxKey(v)]; })); const vecs = A.slice(1).map(z => ev(z)).filter(Array.isArray); return x.map((v, i) => +(want.has(fxKey(v)) || vecs.some(c => fxKey(c[i]) === fxKey(v)))); }
      case "is_blank": return V(0).map(v => +FXB(v)); case "is_number": return V(0).map(v => +(typeof v === "number" && isFinite(v))); case "is_text": return V(0).map(v => +(typeof v === "string" && v !== ""));
      case "if_blank": { const x = V(0), y = V(1); return x.map((v, i) => FXB(v) || (typeof v === "string" && /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CIRC!|CALC!)$/.test(v.trim())) ? y[i] : v); }
      // text
      case "join_text": return rows(v => v.map(fxS).join(""));
      case "join_with": { const sep = V(0); return rows((v, i) => v.filter(x => !FXB(x)).map(fxS).join(fxS(sep[i])), 1); }
      case "TEXTJOIN": { const sep = V(0), ig = V(1); return rows((v, i) => (fxTruth(ig[i]) === 0 ? v : v.filter(x => !FXB(x))).map(fxS).join(fxS(sep[i])), 2); }
      case "first_letters": { const k = KS(1, 1); return V(0).map((v, i) => FXB(v) ? null : fxS(v).slice(0, Math.max(0, k[i]))); }
      case "last_letters": { const k = KS(1, 1); return V(0).map((v, i) => FXB(v) ? null : k[i] > 0 ? fxS(v).slice(-k[i]) : ""); }
      case "middle_letters": { const st = KS(1), k = KS(2); return V(0).map((v, i) => FXB(v) ? null : fxS(v).substr(Math.max(0, st[i] - 1), Math.max(0, k[i]))); }
      case "text_before": case "text_after": { const sep = V(1); return V(0).map((v, i) => { if (FXB(v)) return null; const s = fxS(v), p = fxS(sep[i]); const at = s.toLowerCase().indexOf(p.toLowerCase()); if (at < 0 || !p) return null; return F === "text_before" ? s.slice(0, at) : s.slice(at + p.length); }); }
      case "split_part": { const sep = V(1), k = KS(2); return V(0).map((v, i) => { if (FXB(v)) return null; const sp = fxS(sep[i]); const parts = !sp || sp === " " ? fxS(v).trim().split(/\s+/) : fxS(v).split(sp); const j = Math.floor(k[i]); const x = j > 0 ? parts[j - 1] : j < 0 ? parts[parts.length + j] : undefined; return x == null ? null : x.trim(); }); }
      case "text_length": return V(0).map(v => fxS(v).length);
      case "word_count": return V(0).map(v => { const s = fxS(v).trim(); return s ? s.split(/\s+/).length : 0; });
      case "upper_case": return txt(s => s.toUpperCase()); case "lower_case": return txt(s => s.toLowerCase());
      case "title_case": return txt(s => s.toLowerCase().replace(/(^|[\s\-'(/])([a-zà-ÿ])/g, (m, a2, b2) => a2 + b2.toUpperCase()));
      case "trim_spaces": return txt(s => s.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim());
      case "replace_text": { const f = V(1), w = V(2); return V(0).map((v, i) => FXB(v) ? null : fxS(f[i]) ? fxS(v).split(fxS(f[i])).join(fxS(w[i])) : fxS(v)); }
      case "position_of": { const f = V(0), x = V(1); const cs = /^find$/i.test(a.raw); return x.map((v, i) => { const s = fxS(v), p = fxS(f[i]); const at = cs ? s.indexOf(p) : s.toLowerCase().indexOf(p.toLowerCase()); return at >= 0 ? at + 1 : NaN; }); }
      case "contains": { const p = V(1); return V(0).map((v, i) => +(fxS(v).toLowerCase().includes(fxS(p[i]).toLowerCase()))); }
      case "starts_with": { const p = V(1); return V(0).map((v, i) => +(fxS(v).toLowerCase().startsWith(fxS(p[i]).toLowerCase()))); }
      case "ends_with": { const p = V(1); return V(0).map((v, i) => +(fxS(v).toLowerCase().endsWith(fxS(p[i]).toLowerCase()))); }
      case "same_text": { const b2 = V(1); return V(0).map((v, i) => +(fxS(v) === fxS(b2[i]))); }
      case "repeat_text": { const k = KS(1); return V(0).map((v, i) => isFinite(k[i]) && k[i] >= 0 && k[i] < 10000 ? fxS(v).repeat(Math.floor(k[i])) : null); }
      case "to_number": return V(0).map(v => { if (typeof v === "string" && /%\s*$/.test(v)) { const x = fxNum(v); return isFinite(x) ? x / 100 : NaN; } return fxNum(v); });
      case "extract_number": return V(0).map(v => { if (typeof v === "number") return v; const m = fxS(v).replace(/(\d),(\d{3})/g, "$1$2").match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; });
      case "to_text": return V(0).map(v => FXB(v) ? null : fxS(v));
      case "format_number": { const d = KS(1, 2); return V(0).map((v, i) => fxFmtNum(fxNum(v), d[i])); }
      case "format_percent": { const d = KS(1, 1); return V(0).map((v, i) => { const x = fxNum(v); return isFinite(x) ? fxFmtNum(x * 100, d[i]) + "%" : null; }); }
      case "TEXT": { const f = V(1); return V(0).map((v, i) => { const pat = fxS(f[i]); if (/[yd]|m{3,}/i.test(pat) || (/m/i.test(pat) && !/[0#]/.test(pat))) return fxFmtDate(fxDate(v), pat); const x = fxNum(v); if (!isFinite(x)) return fxS(v); const dec = (pat.split(".")[1] || "").replace(/[^0#]/g, "").length; if (pat.includes("%")) return fxFmtNum(x * 100, dec, pat.includes(",")) + "%"; return fxFmtNum(x, dec, pat.includes(",")); }); }
      // dates
      case "today": { const d = new Date(); return fxISO(fxDay(d.getFullYear(), d.getMonth() + 1, d.getDate())); }
      case "make_date": case "DATE": { const y = KS(0), m = KS(1), d = KS(2); return y.map((yy, i) => { if (![yy, m[i], d[i]].every(isFinite)) return null; const t = Date.UTC(yy, m[i] - 1, d[i]); return fxISO(t / 864e5); }); }
      case "to_date": return dates(0).map(fxISO);
      case "year": case "month": case "quarter": case "day_of_month": case "period": { const raw = V(0); return raw.map(v => { const s = fxS(v).trim(); const p = typeof dsParseTime === "function" ? dsParseTime(s) : null; const d = fxDate(v);
        if (!isFinite(d)) return NaN; const q = fxYMD(d); const annual = /^\d{4}(\.0)?$/.test(s) || (typeof v === "number" && v >= 1800 && v <= 2200), quarterly = /q[1-4]/i.test(s), monthly = /^\d{4}\s*[-/M]\s*\d{1,2}$/.test(s) || /^[A-Za-z]{3,9}\.?[\s-]+\d{4}$/.test(s);
        if (F === "year") return q.y; if (F === "month") return annual ? NaN : q.m; if (F === "quarter") return annual ? NaN : Math.ceil(q.m / 3); if (F === "day_of_month") return annual || monthly || quarterly ? NaN : q.d;
        if (p && isFinite(p.t) && p.freq !== "daily") return p.t; if (annual) return q.y; if (quarterly) return q.y + (Math.ceil(q.m / 3) - 1) / 4; if (monthly) return q.y + (q.m - 1) / 12; return q.y + (d - fxDay(q.y, 1, 1)) / 365.25; }); }
      case "weekday_number": return dates(0).map(d => isFinite(d) ? ((fxYMD(d).w + 6) % 7) + 1 : NaN);
      case "WEEKDAY": { const ty = has(1) ? KS(1) : new Array(n).fill(1); return dates(0).map((d, i) => { if (!isFinite(d)) return NaN; const w = fxYMD(d).w; return ty[i] === 2 ? ((w + 6) % 7) + 1 : ty[i] === 3 ? (w + 6) % 7 : w + 1; }); }
      case "weekday_name": return dates(0).map(d => isFinite(d) ? FX_DAYS[fxYMD(d).w] : null);
      case "month_name": return dates(0).map(d => isFinite(d) ? FX_MONTHS[fxYMD(d).m - 1] : null);
      case "week_number": return dates(0).map(d => { if (!isFinite(d)) return NaN; const dt = new Date(d * 864e5); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); const fy = dt.getUTCFullYear(); const f4 = new Date(Date.UTC(fy, 0, 4)); return 1 + Math.round(((dt - f4) / 864e5 - 3 + ((f4.getUTCDay() + 6) % 7)) / 7); });
      case "days_between": { const a2 = dates(0), b2 = dates(1); return a2.map((d, i) => isFinite(d) && isFinite(b2[i]) ? b2[i] - d : NaN); }
      case "DAYS": { const e = dates(0), s = dates(1); return e.map((d, i) => isFinite(d) && isFinite(s[i]) ? d - s[i] : NaN); }
      case "months_between": { const a2 = dates(0), b2 = dates(1); return a2.map((d, i) => isFinite(d) && isFinite(b2[i]) ? fxMonthsBetween(d, b2[i]) : NaN); }
      case "years_between": { const a2 = dates(0), b2 = dates(1); return a2.map((d, i) => isFinite(d) && isFinite(b2[i]) ? Math.trunc(fxMonthsBetween(d, b2[i]) / 12) : NaN); }
      case "DATEDIF": { const a2 = dates(0), b2 = dates(1), u = V(2); return a2.map((d, i) => { if (!isFinite(d) || !isFinite(b2[i])) return NaN; const k = fxS(u[i]).toLowerCase(); const mm = fxMonthsBetween(d, b2[i]); return k === "y" ? Math.trunc(mm / 12) : k === "m" ? mm : k === "d" ? b2[i] - d : k === "ym" ? mm % 12 : NaN; }); }
      case "year_fraction": { const a2 = dates(0), b2 = dates(1); return a2.map((d, i) => isFinite(d) && isFinite(b2[i]) ? (b2[i] - d) / 365.25 : NaN); }
      case "workdays_between": { const a2 = dates(0), b2 = dates(1); return a2.map((d, i) => { const e = b2[i]; if (!isFinite(d) || !isFinite(e)) return NaN; const s = Math.min(d, e), t = Math.max(d, e); let c = 0; const full = Math.floor((t - s + 1) / 7); c = full * 5; for (let x = s + full * 7; x <= t; x++) { const w = fxYMD(x).w; if (w !== 0 && w !== 6) c++; } return e >= d ? c : -c; }); }
      case "add_days": { const d = dates(0), k = KS(1); return d.map((x, i) => isFinite(x) && isFinite(k[i]) ? fxISO(x + Math.round(k[i])) : null); }
      case "add_months": { const d = dates(0), k = KS(1); return d.map((x, i) => isFinite(x) && isFinite(k[i]) ? fxISO(fxAddMonths(x, Math.round(k[i]))) : null); }
      case "add_years": { const d = dates(0), k = KS(1); return d.map((x, i) => isFinite(x) && isFinite(k[i]) ? fxISO(fxAddMonths(x, Math.round(k[i]) * 12)) : null); }
      case "end_of_month": { const d = dates(0), k = KS(1, 0); return d.map((x, i) => { if (!isFinite(x)) return null; const q = fxYMD(fxAddMonths(fxDay(fxYMD(x).y, fxYMD(x).m, 1), Math.round(k[i] || 0))); return fxISO(fxDay(q.y, q.m, new Date(Date.UTC(q.y, q.m, 0)).getUTCDate())); }); }
      case "age": { const b2 = dates(0); const now = new Date(); const td = fxDay(now.getFullYear(), now.getMonth() + 1, now.getDate()); const on = has(1) ? dates(1) : new Array(n).fill(td); return b2.map((d, i) => isFinite(d) && isFinite(on[i]) ? Math.trunc(fxMonthsBetween(d, on[i]) / 12) : NaN); }
      case "format_date": { const p = V(1); return dates(0).map((d, i) => fxFmtDate(d, fxS(p[i]))); }
      // lookup
      case "look_up": case "XLOOKUP": { const want = V(0), keys = V(1), vals = V(2), nf = has(3) ? V(3) : null; const m = lookupMap(keys, vals); return want.map((w, i) => { const v = m.get(fxKey(w)); return v !== undefined ? v : nf ? nf[i] : null; }); }
      case "look_up_from": { const dsName = nameOf(A[0]); const dss = ctx.datasets || {}; const hit = Object.values(dss).find(d => String(d.name).toLowerCase() === String(dsName || "").toLowerCase()) || Object.values(dss).find(d => String(d.name).toLowerCase().startsWith(String(dsName || "").toLowerCase()));
        if (!hit) throw new Error(`No dataset called "${dsName}". Put the dataset name in quotes exactly as it appears in Datasets${Object.values(dss).length ? `, for example "${Object.values(dss)[0].name}"` : ""}.`);
        const mc = nameOf(A[2]), rc = nameOf(A[3]); const col = (nm) => { let j = hit.headers.indexOf(nm); if (j < 0) j = hit.headers.findIndex(h => h.toLowerCase() === String(nm).toLowerCase()); if (j < 0) throw new Error(`"${hit.name}" has no column called "${nm}". Its columns are: ${hit.headers.slice(0, 12).join(", ")}${hit.headers.length > 12 ? "…" : ""}`); return j; };
        const jm = col(mc), jr = col(rc); const m = lookupMap(hit.rows.map(r => fxCell(r[jm])), hit.rows.map(r => fxCell(r[jr]))); const want = V(1), nf = has(4) ? V(4) : null; return want.map((w, i) => { const v = m.get(fxKey(w)); return v !== undefined ? v : nf ? nf[i] : null; }); }
      case "position_in": case "MATCH": { const want = V(0), col = V(1); const m = new Map(); col.forEach((k, i) => { const kk = fxKey(k); if (kk !== "" && !m.has(kk)) m.set(kk, i + 1); }); return want.map(w => m.get(fxKey(w)) ?? NaN); }
      case "value_at_row": case "INDEX": { if (F === "INDEX" && A.length === 1) return series(vs => { const b2 = vs.find(isFinite); return vs.map(v => isFinite(v) && b2 ? v / b2 * 100 : NaN); }); const col = V(0), k = KS(1); return k.map(r => { const j = Math.floor(r) - 1; return j >= 0 && j < n ? col[j] : null; }); }
      case "row_number": return Array.from({ length: n }, (_, i) => i + 1);
      case "count_rows": return n;
      // over time
      case "previous_value": case "next_value": { const s = Math.round((has(1) ? KS(1)[0] : 1)) * (F === "previous_value" ? 1 : -1); return mapG(V(0), vs => vs.map((_, q) => { const j = q - s; return j >= 0 && j < vs.length ? vs[j] : null; })); }
      case "change": { const s = Math.round(has(1) ? KS(1)[0] : 1); return series(vs => vs.map((v, q) => q - s >= 0 ? v - vs[q - s] : NaN)); }
      case "growth_rate": { const s = Math.round(has(1) ? KS(1)[0] : 1); return series(vs => vs.map((v, q) => q - s >= 0 && vs[q - s] ? (v / vs[q - s] - 1) * 100 : NaN)); }
      case "moving_average": case "moving_total": { const w = Math.max(1, Math.round(KS(1)[0] || 3)); return series(vs => vs.map((_, q) => { if (q < w - 1) return NaN; const win = vs.slice(q - w + 1, q + 1); if (!win.every(isFinite)) return NaN; const s = win.reduce((a2, b2) => a2 + b2, 0); return F === "moving_total" ? s : s / w; })); }
      case "ema": case "rsi": case "macd": case "macd_signal": case "macd_histogram": { const emaOf = (vs, w) => { const o = new Array(vs.length).fill(NaN); let e = NaN, k = 0, sum = 0; const a = 2 / (w + 1); for (let q = 0; q < vs.length; q++) { const v = vs[q]; if (!isFinite(v)) { if (isFinite(e)) o[q] = NaN; continue; } if (!isFinite(e)) { sum += v; k++; if (k === w) { e = sum / w; o[q] = e; } } else { e = a * v + (1 - a) * e; o[q] = e; } } return o; };
        if (F === "ema") { const w = Math.max(1, Math.round(KS(1)[0] || 10)); return series(vs => emaOf(vs, w)); }
        if (F === "rsi") { const w = Math.max(1, Math.round(has(1) ? KS(1)[0] : 14)); return series(vs => { const o = new Array(vs.length).fill(NaN); let g = 0, l = 0, k = 0; for (let q = 1; q < vs.length; q++) { const d = vs[q] - vs[q - 1]; if (!isFinite(d)) continue; const up = Math.max(0, d), dn = Math.max(0, -d); if (k < w) { g += up; l += dn; k++; if (k === w) { g /= w; l /= w; o[q] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (w - 1) + up) / w; l = (l * (w - 1) + dn) / w; o[q] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }); }
        const f = Math.round(has(1) ? KS(1)[0] : 12), sl = Math.round(has(2) ? KS(2)[0] : 26), sg = Math.round(has(3) ? KS(3)[0] : 9);
        return series(vs => { const a = emaOf(vs, f), b = emaOf(vs, sl); const line = vs.map((_, q) => a[q] - b[q]); if (F === "macd") return line; const start = line.findIndex(isFinite); const sig = new Array(vs.length).fill(NaN); if (start >= 0) emaOf(line.slice(start), sg).forEach((v, q) => sig[start + q] = v); return F === "macd_signal" ? sig : line.map((v, q) => v - sig[q]); }); }
      case "bollinger_upper": case "bollinger_lower": case "rolling_sd": { const w = Math.max(2, Math.round(has(1) ? KS(1)[0] : 20)), kk = F === "rolling_sd" ? 0 : has(2) ? KS(2)[0] : 2; return series(vs => vs.map((_, q) => { if (q < w - 1) return NaN; const win = vs.slice(q - w + 1, q + 1); if (!win.every(isFinite)) return NaN; const mu = win.reduce((a2, b2) => a2 + b2, 0) / w;
          if (F === "rolling_sd") return Math.sqrt(win.reduce((a2, b2) => a2 + (b2 - mu) ** 2, 0) / (w - 1)); const sd = Math.sqrt(win.reduce((a2, b2) => a2 + (b2 - mu) ** 2, 0) / w); return F === "bollinger_upper" ? mu + kk * sd : mu - kk * sd; })); }
      case "log_return": return series(vs => vs.map((v, q) => q > 0 && v > 0 && vs[q - 1] > 0 ? Math.log(v / vs[q - 1]) : NaN));
      case "rate_of_change": case "momentum": { const s2 = Math.round(has(1) ? KS(1)[0] : 10); return series(vs => vs.map((v, q) => { const p = q - s2 >= 0 ? vs[q - s2] : NaN; if (!isFinite(v) || !isFinite(p)) return NaN; return F === "momentum" ? v - p : p ? (v / p - 1) * 100 : NaN; })); }
      case "drawdown": return series(vs => { let m = -Infinity; return vs.map(v => { if (!isFinite(v)) return NaN; if (v > m) m = v; return m > 0 ? (v / m - 1) * 100 : NaN; }); });
      case "true_range": case "atr": case "stochastic_k": { const Hh = V(0).map(fxNum), Ll = V(1).map(fxNum), Cc = V(2).map(fxNum); const w = Math.max(1, Math.round(has(3) ? KS(3)[0] : 14));
        return mapG(Cc, (_, g) => { const tr = g.map((i, q) => { const h = Hh[i], l = Ll[i]; if (!isFinite(h) || !isFinite(l)) return NaN; if (q === 0) return h - l; const pc = Cc[g[q - 1]]; return isFinite(pc) ? Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)) : h - l; });
          if (F === "true_range") return tr;
          if (F === "atr") { const o = new Array(g.length).fill(NaN); let a = NaN, k = 0, sum = 0; for (let q = 1; q < g.length; q++) { const t = tr[q]; if (!isFinite(t)) continue; if (!isFinite(a)) { sum += t; k++; if (k === w) { a = sum / w; o[q] = a; } } else { a = (a * (w - 1) + t) / w; o[q] = a; } } return o; }
          return g.map((i, q) => { if (q < w - 1) return NaN; let hi = -Infinity, lo = Infinity; for (let r = q - w + 1; r <= q; r++) { const j = g[r]; if (!isFinite(Hh[j]) || !isFinite(Ll[j])) return NaN; hi = Math.max(hi, Hh[j]); lo = Math.min(lo, Ll[j]); } return hi > lo && isFinite(Cc[i]) ? (Cc[i] - lo) / (hi - lo) * 100 : NaN; }); }); }
      case "on_balance_volume": { const Cc = V(0).map(fxNum), Vv = V(1).map(fxNum); return mapG(Cc, (_, g) => { let o = 0; return g.map((i, q) => { if (q === 0) return 0; const d = Cc[i] - Cc[g[q - 1]]; if (isFinite(d) && isFinite(Vv[i])) o += d > 0 ? Vv[i] : d < 0 ? -Vv[i] : 0; return o; }); }); }
      case "is_error": return V(0).map(v => +((typeof v === "number" && !isFinite(v)) || (typeof v === "string" && /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CIRC!|CALC!)$/.test(v.trim()))));
      case "is_na": return V(0).map(v => +(v == null || (typeof v === "string" && v.trim() === "#N/A")));
      case "error_type": { const E = { "#NULL!": 1, "#DIV/0!": 2, "#VALUE!": 3, "#REF!": 4, "#NAME?": 5, "#NUM!": 6, "#N/A": 7 }; return V(0).map(v => typeof v === "string" && E[v.trim()] ? E[v.trim()] : typeof v === "number" && !isFinite(v) ? 6 : null); }
      case "running_total": return series(vs => { let c = 0; return vs.map(v => { if (isFinite(v)) c += v; return isFinite(v) ? c : NaN; }); });
      case "running_average": return series(vs => { let c = 0, k = 0; return vs.map(v => { if (isFinite(v)) { c += v; k++; } return isFinite(v) ? c / k : NaN; }); });
      case "highest_so_far": return series(vs => { let m = -Infinity; return vs.map(v => { if (isFinite(v) && v > m) m = v; return isFinite(m) ? m : NaN; }); });
      case "lowest_so_far": return series(vs => { let m = Infinity; return vs.map(v => { if (isFinite(v) && v < m) m = v; return isFinite(m) ? m : NaN; }); });
      case "index_to_100": return series(vs => { const b2 = vs.find(isFinite); return vs.map(v => isFinite(v) && b2 ? v / b2 * 100 : NaN); });
      case "average_growth": return series(vs => { const idx = vs.map((v, q) => [v, q]).filter(([v]) => isFinite(v) && v > 0); if (idx.length < 2) return vs.map(() => NaN); const [f, q0] = idx[0], [l, q1] = idx[idx.length - 1]; const g = (Math.pow(l / f, 1 / (q1 - q0)) - 1) * 100; return vs.map(() => g); });
      // finance
      case "loan_payment": { const r = KS(0), np = KS(1), pv = KS(2), fv = KS(3, 0); return r.map((x, i) => -pmt(x, np[i], pv[i], -(fv[i] || 0))); }
      case "PMT": { const r = KS(0), np = KS(1), pv = KS(2), fv = KS(3, 0), ty = KS(4, 0); return r.map((x, i) => pmt(x, np[i], pv[i], fv[i] || 0, ty[i] || 0)); }
      case "future_value": { const r = KS(0), np = KS(1), pm = KS(2), pv = KS(3, 0); return r.map((x, i) => fvf(x, np[i], -pm[i], -(pv[i] || 0))); }
      case "FV": { const r = KS(0), np = KS(1), pm = KS(2), pv = KS(3, 0), ty = KS(4, 0); return r.map((x, i) => fvf(x, np[i], pm[i], pv[i] || 0, ty[i] || 0)); }
      case "present_value": { const r = KS(0), np = KS(1), pm = KS(2), fv = KS(3, 0); return r.map((x, i) => pvf(x, np[i], -pm[i], -(fv[i] || 0))); }
      case "PV": { const r = KS(0), np = KS(1), pm = KS(2), fv = KS(3, 0), ty = KS(4, 0); return r.map((x, i) => pvf(x, np[i], pm[i], fv[i] || 0, ty[i] || 0)); }
      case "net_present_value": { const r = KS(0); return rows((v, i) => { const f = v.map(fxNum); if (!f.some(isFinite)) return NaN; return f.reduce((s, c, t) => s + (isFinite(c) ? c / Math.pow(1 + r[i], t + 1) : 0), 0); }, 1); }
      case "internal_rate_of_return": return rows(v => irr(v.map(fxNum).filter(isFinite)));
      case "periods_needed": { const r = KS(0), pm = KS(1), pv = KS(2); return r.map((x, i) => nperf(x, -pm[i], pv[i])); }
      case "NPER": { const r = KS(0), pm = KS(1), pv = KS(2), fv = KS(3, 0), ty = KS(4, 0); return r.map((x, i) => nperf(x, pm[i], pv[i], fv[i] || 0, ty[i] || 0)); }
      case "interest_rate": { const np = KS(0), pm = KS(1), pv = KS(2); return np.map((x, i) => ratef(x, -pm[i], pv[i])); }
      case "RATE": { const np = KS(0), pm = KS(1), pv = KS(2), fv = KS(3, 0), ty = KS(4, 0); return np.map((x, i) => ratef(x, pm[i], pv[i], fv[i] || 0, ty[i] || 0)); }
      case "cagr": { const s = KS(0), e = KS(1), y = KS(2); return s.map((x, i) => x > 0 && e[i] >= 0 && y[i] > 0 ? (Math.pow(e[i] / x, 1 / y[i]) - 1) * 100 : NaN); }
      case "RRI": { const np = KS(0), pv = KS(1), fv = KS(2); return np.map((x, i) => x > 0 && pv[i] > 0 ? Math.pow(fv[i] / pv[i], 1 / x) - 1 : NaN); }
      case "effective_rate": { const r = KS(0), k = KS(1); return r.map((x, i) => k[i] >= 1 ? Math.pow(1 + x / Math.floor(k[i]), Math.floor(k[i])) - 1 : NaN); }
      case "depreciation": { const c = KS(0), s = KS(1), l = KS(2); return c.map((x, i) => l[i] ? (x - s[i]) / l[i] : NaN); }
      default: throw new Error(`Function ${a.raw || F} is not available`); } };
  return vec(ev(ast)); };
// Column names with symbols (like TBL_Index_(2024-21)) typed without brackets are wrapped in [ ] automatically
const fxWrapCols = (expr, names) => { const odd = names.filter(h => h && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(h) && !/^\s|\s$/.test(h)).sort((a, b) => b.length - a.length); if (!odd.length) return expr;
  let out = "", i = 0, q = null; while (i < expr.length) { const c = expr[i]; if (q) { out += c; if (c === q) q = null; i++; continue; } if (FX_Q[c]) { q = FX_Q[c]; out += c; i++; continue; }
    const prev = out[out.length - 1] || ""; let hit = null; if (!/[A-Za-z0-9_.]/.test(prev)) for (const h of odd) { if (expr.startsWith(h, i) && !/[A-Za-z0-9_.]/.test(expr[i + h.length] || "")) { hit = h; break; } }
    if (hit) { out += "[" + hit + "]"; i += hit.length; } else { out += c; i++; } }
  return out; };
const fxStripComment = (raw) => { let q = null; for (let i = 0; i < raw.length; i++) { const c = raw[i]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'" || c === "`") q = c; else if (c === "[") q = "]"; else if (c === "#") return raw.slice(0, i); } return raw; };
// Run a block of formula lines on {headers, rows}. opts: {unit, time, datasets}. Returns {headers, rows, results:[{line, name, ok, error, created}]}
// Split a list of column names: a, [b c], `d (2024)`, 'e'
const fxNameList = (txt) => { const out = []; let cur = "", q = null; for (const c of txt) { if (q) { if (c === q) q = null; cur += c; continue; } if (FX_Q[c]) { q = FX_Q[c]; cur += c; continue; } if (c === ",") { out.push(cur); cur = ""; continue; } cur += c; } out.push(cur);
  return out.map(x => { x = x.trim(); const o = x[0]; if (FX_Q[o] && x.endsWith(FX_Q[o]) && x.length > 1) x = x.slice(1, -1).trim(); return x; }).filter(Boolean); };
// Shown in the help list (searchable): commands that change the table
const FX_COMMANDS = [
  { ex:"drop columns a, b", ins:"drop columns ", d:"Remove columns (names separated by commas)", k:"delete remove drop columns variables" },
  { ex:"keep columns country, year, gdp", ins:"keep columns ", d:"Keep only these columns, in this order", k:"keep select columns subset reorder" },
  { ex:"drop rows where year < 2010", ins:"drop rows where ", d:"Remove the rows where a condition holds", k:"delete remove drop rows filter exclude where" },
  { ex:"keep rows where region == \"West\"", ins:"keep rows where ", d:"Keep only the rows where a condition holds", k:"keep rows filter subset select where only" },
  { ex:"use row 1 as column names", ins:"use row 1 as column names", d:"Take names from a row for columns called col3, Column 5 and the like (others keep their names) and remove that row; add  with prefix y  for y2013, or  for all  to rename every column", k:"header headers first row column names rename promote titles variable names" },
  { ex:"rename col3 to y2013, LTA(2013-24) to LTA", ins:"rename ", d:"Rename columns and keep their place; many pairs on one line; * matches any text: rename y* to score_*", k:"rename name names change column variable header relabel" },
];
// Table commands that can sit between formulas
const FX_CMD_COLS = /^(drop|delete|remove|keep)\s+(only\s+)?(the\s+)?(columns?|cols?|variables?|vars?)\s*:?\s+(.+)$/i;
// generic names that a header row may replace; placeholder cells keep the old name
const FX_GENERIC = /^(col|column|field|var|v|x|unnamed:?)[\s_.-]*\d+$/i;
const FX_PLACEHOLDER = /^(-+|–|—|\.+|na|n\/a|nan|null|none|#n\/a)$/i;
const fxRowNames = (H, row, prefix, all) => { const used = new Set(); return H.map((h, j) => { let v = String(row[j] ?? "").trim();
  if (!v || FX_PLACEHOLDER.test(v) || (!all && h && !FX_GENERIC.test(h))) v = h; else if (prefix && /^[-+]?\d/.test(v)) v = prefix + v.replace(/\.0+$/, "");
  let nm = v, k = 2; while (used.has(nm.toLowerCase())) nm = `${v}_${k++}`; used.add(nm.toLowerCase()); return nm; }); };
const FX_CMD_HDR = /^(use|make|set|take)\s+(the\s+)?(first\s+row|row\s+(\d+))\s+(as|for|into)\s+(the\s+)?(column\s+names|columns?\s+headers?|headers?|names|variable\s+names)(\s+with\s+prefix\s+([A-Za-z_]+))?(\s+(for|on)\s+all(\s+columns)?)?\s*$/i;
const FX_CMD_REN = /^rename\s+(.+)$/i;
const FX_CMD_ROWS = /^(drop|delete|remove|keep)\s+(only\s+)?(the\s+)?rows?\s+(where|if|when|with)\s+(.+)$/i;
// Stata-style loops, expanded before running: to_foreach x in a b c { ... }  ·  to_foreach v of varlist gdp* { ... }  ·  to_forvalues i = 1/5 { ... } (also 10(10)50)
// Inside the block write `x' (Stata style) or {x}. Each expanded line keeps the line number of the original.
const fxExpandLoops = (text, headers = []) => { const src = text.split(/\r?\n/).map((raw, li) => ({ raw, li })); const out = [];
  const nums = (spec) => { spec = spec.trim(); let m; if ((m = spec.match(/^(-?[\d.]+)\s*\/\s*(-?[\d.]+)$/))) { const a = +m[1], b = +m[2]; const o = []; for (let v = a; a <= b ? v <= b : v >= b; v += a <= b ? 1 : -1) { o.push(v); if (o.length > 5000) break; } return o; }
    if ((m = spec.match(/^(-?[\d.]+)\s*\(\s*(-?[\d.]+)\s*\)\s*(-?[\d.]+)$/))) { const a = +m[1], st = +m[2], b = +m[3]; if (!st) return [a]; const o = []; for (let v = a; st > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += st) { o.push(+v.toPrecision(12)); if (o.length > 5000) break; } return o; }
    return spec.split(/[\s,]+/).filter(Boolean).map(Number).filter(isFinite); };
  const items = (kind, list) => { const toks = list.match(/"[^"]*"|\S+/g) || []; if (kind === "varlist") { const o = []; toks.forEach(t => { if (/[*?]/.test(t)) { const re = new RegExp("^" + t.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i"); headers.filter(h => re.test(h)).forEach(h => o.push(h)); } else o.push(t); }); return o; }
    if (kind === "numlist") return nums(list).map(String); return toks.map(t => t.replace(/^"|"$/g, "")); };
  const walk = (lines, i, end, sub) => { while (i < end) { const L = lines[i]; const raw = sub(L.raw); let m;
      if ((m = raw.match(/^\s*to_(foreach|forvalues)\s+([A-Za-z_]\w*)\s+(in|of\s+(varlist|local|numlist|global|newlist)|=)\s*(.*?)\s*\{\s*$/i))) {
        let depth = 1, j = i + 1; for (; j < end; j++) { const t = lines[j].raw.trim(); if (/\{\s*$/.test(t) && /^to_(foreach|forvalues)\b/i.test(t)) depth++; else if (t === "}") { depth--; if (!depth) break; } }
        if (depth) { out.push({ raw: `__err:The to_${m[1]} block that starts here has no closing } on its own line.`, li: L.li }); return; }
        const name = m[2], vals = m[1].toLowerCase() === "forvalues" ? nums(m[5]).map(String) : items(m[4] ? m[4].toLowerCase() : "in", m[5]);
        if (!vals.length) out.push({ raw: `__err:to_${m[1]} has nothing to loop over.`, li: L.li });
        const re = new RegExp("`" + name + "'|\\{" + name + "\\}", "g"); vals.forEach(v => walk(lines, i + 1, j, (x) => sub(x).replace(re, v)));
        if (out.length > 20000) { out.push({ raw: "__err:The loops produce more than 20,000 lines; make them smaller.", li: L.li }); return; } i = j + 1; continue; }
      if (raw.trim() === "}") { out.push({ raw: "__err:This } has no matching to_foreach or to_forvalues.", li: L.li }); i++; continue; }
      out.push({ raw, li: L.li }); i++; } };
  walk(src, 0, src.length, (x) => x); return out; };
// Run a script all at once (fxRun) or step by step so it can be stopped (fxRunAsync)
const fxRun = (table, text, opts = {}) => { const R = fxRunCore(table, text, opts); while (R.step()); return R.result(); };
const fxRunAsync = async (table, text, opts = {}, ctl = {}) => { const R = fxRunCore(table, text, opts); let t = performance.now();
  while (R.step()) { if (ctl.stop) { const r = R.result(); r.stopped = true; r.results.push({ line: R.lastLine, ok: false, error: `Stopped by you after ${R.done} of ${R.total} lines. Lines after this did not run.` }); return r; }
    if (performance.now() - t > 30) { if (ctl.onProgress) ctl.onProgress(R.done, R.total, R.lastLine, R.note); await new Promise(res => setTimeout(res, 0)); t = performance.now(); } }
  return R.result(); };
const fxRunCore = (table, text, opts = {}) => {
  const headers = table.headers.slice(); let n = table.rows.length; const cols = Object.fromEntries(headers.map((h, j) => [h, table.rows.map(r => r[j])]));
  // groups (unit) in time order, rebuilt after rows are dropped
  let unitC = opts.unit || "", timeC = opts.time || "";
  const buildGroups = () => { const U = unitC && cols[unitC], Tm = timeC && cols[timeC]; const tv = (i) => { if (!Tm) return i; const v = Tm[i]; const p = typeof dsParseTime === "function" ? dsParseTime(v) : null; if (p) return p.t; const d = fxDate(v); return isFinite(d) ? d : fxNum(v); };
    const gm = new Map(); for (let i = 0; i < n; i++) { const k = U ? String(U[i] ?? "") : "_"; if (!gm.has(k)) gm.set(k, []); gm.get(k).push(i); } return [...gm.values()].map(g => Tm ? g.sort((a, b) => tv(a) - tv(b)) : g); };
  let groups = buildGroups();
  const results = []; const created = []; let changed = false; const outs = []; let pending = null;
  const findCol = (nm) => headers.find(h => h === nm) || headers.find(h => h.toLowerCase() === nm.toLowerCase()) || headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, "") === nm.toLowerCase().replace(/[^a-z0-9]/g, ""));
  // state handed to the Stata-style to_ commands (wb_stata.js)
  const est = { models: [], last: null, scalars: {}, lastG: 0 };
  const S = { get headers() { return headers; }, cols, get n() { return n; }, get unit() { return unitC && cols[unitC] ? unitC : ""; }, findCol, groups: () => groups, est,
    evalExpr: (expr) => { let e = String(expr).replace(/^=\s*/, ""); const tmp = [];
      // stored results: r(mean) after to_sum, e(r2) after a model, scalar(name) from to_scalar
      e = e.replace(/\b(r|e)\((\w+)\)|\bscalar\((\w+)\)/g, (all, kind, k, sc) => { if (sc) { if (!(sc in est.scalars)) throw new Error(`No scalar called ${sc}. Make it with  to_scalar ${sc} = ...`); return `(${est.scalars[sc]})`; }
        const src = kind === "r" ? est.r : est.last && { N: est.last.N, r2: est.last.r2, r2_a: est.last.ar2, F: est.last.F, rmse: est.last.rmse, ll: est.last.ll, df_r: est.last.df };
        if (!src || src[k] == null) throw new Error(`${kind}(${k}) is not set. ${kind === "r" ? "Run to_sum first." : "Run a model first."}`); return `(${src[k]})`; });
      // Stata time-series operators inside expressions: L.x L2.x F.x D.x D2.x and chains such as L.D.x
      e = e.replace(/(^|[^A-Za-z0-9_.\]"'])((?:[LDF]\d*\.)+)([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g, (all, pre, ops, v) => { const list = ops.split(".").filter(Boolean); let x = v; for (let q = list.length - 1; q >= 0; q--) { const o = list[q][0].toUpperCase(), k = +(list[q].slice(1) || 1); if (o === "L") x = k === 1 ? `previous_value(${x})` : `previous_value(${x}, ${k})`; else if (o === "F") x = k === 1 ? `next_value(${x})` : `next_value(${x}, ${k})`; else for (let r = 0; r < k; r++) x = `change(${x})`; } return pre + x; });
      // _n (row number) and _N (number of rows), within to_bysort groups when there are any
      if (/\b_[nN]\b/.test(e)) { const nn = new Array(n), NN = new Array(n); if (S.byKeys) { const cnt = new Map(), tot = new Map(); S.byKeys.forEach(k => tot.set(k, (tot.get(k) || 0) + 1)); S.byKeys.forEach((k, i) => { const c = (cnt.get(k) || 0) + 1; cnt.set(k, c); nn[i] = c; NN[i] = tot.get(k); }); } else for (let i = 0; i < n; i++) { nn[i] = i + 1; NN[i] = n; }
        cols.__obs_n = nn; cols.__obs_N = NN; tmp.push("__obs_n", "__obs_N"); e = e.replace(/\b_n\b/g, "__obs_n").replace(/\b_N\b/g, "__obs_N"); }
      try { return fxEval(fxParse(fxWrapCols(e, Object.keys(cols))), { cols, n, groups, datasets: opts.datasets }); } finally { tmp.forEach(k => delete cols[k]); } },
    datasets: opts.datasets || {}, get time() { return timeC && cols[timeC] ? timeC : ""; }, byKeys: null,
    setCol: (name, vals) => { const isNew = !(name in cols); cols[name] = vals; if (isNew) { headers.push(name); created.push(name); } changed = true; },
    filterRows: (keep) => { const mask = Array.from({ length: n }, (_, i) => !!keep(i)); Object.keys(cols).forEach(h => { cols[h] = cols[h].filter((_, i) => mask[i]); }); n = mask.filter(Boolean).length; groups = buildGroups(); changed = true; },
    reorderRows: (idx) => { Object.keys(cols).forEach(h => { const a = cols[h]; cols[h] = idx.map(i => a[i]); }); groups = buildGroups(); changed = true; },
    dropCols: (list) => { list.forEach(h => { const j = headers.indexOf(h); if (j >= 0) headers.splice(j, 1); delete cols[h]; const c = created.indexOf(h); if (c >= 0) created.splice(c, 1); }); changed = true; },
    order: (list) => { const ord = list.filter(h => headers.includes(h)); headers.splice(0, headers.length, ...ord, ...headers.filter(h => !ord.includes(h))); },
    renameCol: (h, nw) => { const j = headers.indexOf(h); headers[j] = nw; const v = cols[h]; delete cols[h]; cols[nw] = v; const c = created.indexOf(h); if (c >= 0) created[c] = nw; if (unitC === h) unitC = nw; if (timeC === h) timeC = nw; changed = true; },
    replaceAll: (H, C) => { headers.splice(0, headers.length, ...H); Object.keys(cols).forEach(k => delete cols[k]); Object.assign(cols, C); n = H.length && C[H[0]] ? C[H[0]].length : 0; created.splice(0, created.length); if (!cols[unitC]) unitC = ""; if (!cols[timeC]) timeC = ""; groups = buildGroups(); changed = true; },
    setPanel: (u, t) => { unitC = u || ""; timeC = t || ""; groups = buildGroups(); } };
  const LINES = fxExpandLoops(text, headers);
  const body = (raw, li) => { if (/^\s*(\*|\/\/)/.test(raw)) return; if (raw.startsWith("__err:")) { results.push({ line: li + 1, ok: false, error: raw.slice(6) }); return; } const line = fxStripComment(raw).trim(); if (!line) return;
    let m;
    const runSt = (nm, rest) => { try { const o = stRun(nm.toLowerCase(), (rest || "").trim(), S, li + 1); if (o.iter) { pending = { o, li }; return; } outs.push(o); results.push({ line: li + 1, ok: true, cmd: true, stata: true, msg: `to_${o.cmd}: ${o.msg || "see Results"}` }); }
      catch (e) { results.push({ line: li + 1, ok: false, error: e.message }); } };
    if ((m = line.match(/^to_([A-Za-z][A-Za-z0-9_]*)(?:\s+(.*)|\s*(,.*))?$/is)) && (m[2] = m[2] || m[3] || "", true) && !/^\s*=(?!=)/.test(m[2] || "") && (ST_CMDS[m[1].toLowerCase()] || ST_ALIAS[m[1].toLowerCase()] || !(fxFuncName(m[0].split("(")[0]) && /\(/.test(line)))) { runSt(m[1], m[2]); return; }
    // the same commands written the Stata way, without to_ (reg y x, twoway scatter y x, graph bar y, over(g), ivregress 2sls ...)
    if (!FX_CMD_COLS.test(line) && !FX_CMD_HDR.test(line) && !FX_CMD_ROWS.test(line) && !/^(drop|delete|remove|keep)\s+rows?\b/i.test(line) && !(/^rename\s/i.test(line) && /\s(to|as)\s|->|=>/i.test(line))) { const b = stBare(line); if (b) { runSt(b.name, b.rest); return; } }
    if ((m = line.match(FX_CMD_COLS))) { const keep = m[1].toLowerCase() === "keep"; const names = fxNameList(m[5]); const found = [], missing = [];
      names.forEach(nm => { const h = findCol(nm); if (h) { if (!found.includes(h)) found.push(h); } else missing.push(nm); });
      if (missing.length) { results.push({ line: li + 1, ok: false, error: `No column called ${missing.map(x => `"${x}"`).join(", ")}. Separate names with commas; click a column name above the box to insert it exactly.` }); return; }
      const gone = keep ? headers.filter(h => !found.includes(h)) : found;
      if (gone.length >= headers.length) { results.push({ line: li + 1, ok: false, error: "That would remove every column. Keep at least one." }); return; }
      gone.forEach(h => { headers.splice(headers.indexOf(h), 1); delete cols[h]; const c = created.indexOf(h); if (c >= 0) created.splice(c, 1); });
      if (keep) { const ord = found.filter(h => headers.includes(h)); headers.splice(0, headers.length, ...ord); }
      changed = changed || gone.length > 0; results.push({ line: li + 1, ok: true, cmd: true, msg: keep ? `kept ${found.length} column${found.length === 1 ? "" : "s"}, dropped ${gone.length}` : `dropped ${gone.length} column${gone.length === 1 ? "" : "s"}: ${gone.slice(0, 6).join(", ")}${gone.length > 6 ? "…" : ""}` }); return; }
    if ((m = line.match(FX_CMD_HDR))) { const ri = m[4] ? +m[4] - 1 : 0; if (ri < 0 || ri >= n) { results.push({ line: li + 1, ok: false, error: `Row ${ri + 1} does not exist; the table has ${n} rows.` }); return; }
      const pre = m[9] || ""; const names = fxRowNames(headers, headers.map(h => fxS(cols[h][ri])), pre, !!m[10]);
      const old = headers.slice(); const newCols = {}; old.forEach((h, j) => { newCols[names[j]] = cols[h].filter((_, i) => i !== ri); }); Object.keys(cols).forEach(k => delete cols[k]); Object.assign(cols, newCols); headers.splice(0, headers.length, ...names);
      for (let c = 0; c < created.length; c++) { const j = old.indexOf(created[c]); if (j >= 0) created[c] = names[j]; } n -= 1; groups = buildGroups(); changed = true;
      const renamed = names.filter((nm, j) => nm !== old[j]).length; results.push({ line: li + 1, ok: true, cmd: true, msg: `row ${ri + 1} renamed ${renamed} column${renamed === 1 ? "" : "s"} (${names.filter((nm, j) => nm !== old[j]).slice(0, 5).join(", ")}${renamed > 5 ? "…" : ""}) and was removed; columns that already had a real name kept it${m[10] ? "" : " (add  for all  to rename every column)"}` }); return; }
    if ((m = line.match(FX_CMD_REN))) { const pairs = fxNameList(m[1].replace(/\s+(to|as|->|=>)\s+/gi, "\u0001")).map(x => x.split("\u0001")); const done = [], errs = [];
      const strip = (x) => { x = (x || "").trim(); const o = x[0]; if (FX_Q[o] && x.endsWith(FX_Q[o]) && x.length > 1) x = x.slice(1, -1).trim(); return x; };
      for (const pr of pairs) { if (pr.length !== 2 || !strip(pr[0]) || !strip(pr[1])) { errs.push("write each pair as  old to new"); continue; } const from = strip(pr[0]), to = strip(pr[1]);
        const targets = from.includes("*") ? (() => { const re = new RegExp("^" + from.split("*").map(x => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("(.*)") + "$", "i"); return headers.map(h => { const mm = h.match(re); return mm ? [h, to.includes("*") ? to.replace("*", mm[1] ?? "") : to] : null; }).filter(Boolean); })() : (() => { const h = findCol(from); return h ? [[h, to]] : []; })();
        if (!targets.length) { errs.push(`no column matches "${from}"`); continue; }
        for (const [h, nw] of targets) { if (!nw) { errs.push(`"${h}" would get an empty name`); continue; } if (nw !== h && headers.some(x => x.toLowerCase() === nw.toLowerCase() && x !== h)) { errs.push(`"${nw}" already exists`); continue; }
          const jj = headers.indexOf(h); headers[jj] = nw; const v = cols[h]; delete cols[h]; cols[nw] = v; const c = created.indexOf(h); if (c >= 0) created[c] = nw; done.push(`${h} → ${nw}`); } }
      if (done.length) changed = true;
      if (errs.length && !done.length) { results.push({ line: li + 1, ok: false, error: `Nothing renamed: ${errs.join("; ")}. Example: rename col3 to y2013, LTA(2013-24) to LTA` }); return; }
      results.push({ line: li + 1, ok: !errs.length, cmd: true, msg: `renamed ${done.length}: ${done.slice(0, 6).join(", ")}${done.length > 6 ? "…" : ""}`, error: errs.length ? `renamed ${done.length} (${done.slice(0, 4).join(", ")}), but ${errs.join("; ")}` : undefined }); return; }
    if ((m = line.match(FX_CMD_ROWS))) { const keep = m[1].toLowerCase() === "keep";
      try { const ast = fxParse(fxWrapCols(m[5].replace(/^=\s*/, ""), Object.keys(cols))); const v = fxEval(ast, { cols, n, groups, datasets: opts.datasets }).map(fxTruth);
        const mask = v.map(t => keep ? t === 1 : t !== 1); const before = n; const unknown = v.filter(t => !isFinite(t)).length;
        Object.keys(cols).forEach(h => { cols[h] = cols[h].filter((_, i) => mask[i]); }); n = cols[headers[0]] ? cols[headers[0]].length : mask.filter(Boolean).length; groups = buildGroups(); changed = changed || n !== before;
        results.push({ line: li + 1, ok: true, cmd: true, msg: `${keep ? "kept" : "dropped"} ${(keep ? n : before - n).toLocaleString()} of ${before.toLocaleString()} rows · ${n.toLocaleString()} left${unknown ? ` (${unknown.toLocaleString()} row${unknown === 1 ? "" : "s"} could not be checked because of blanks and were ${keep ? "dropped" : "kept"})` : ""}` }); }
      catch (e) { results.push({ line: li + 1, ok: false, error: e.message }); } return; }
    if (/^(drop|delete|remove|keep)\s+rows?\b/i.test(line)) { results.push({ line: li + 1, ok: false, error: "Say which rows, for example:  drop rows where year < 2010   or   keep rows where region == \"West\"" }); return; }
    const sp = fxSplit(line); if (!sp) { const lhs = (line.match(/^([^=]+?)\s*=(?!=)/) || [])[1]; results.push({ line: li + 1, ok: false, error: lhs && /[^A-Za-z0-9_.]/.test(lhs.trim()) ? `The new column name "${lhs.trim()}" has spaces or symbols. Put it in backticks (\`${lhs.trim()}\` = …) or use only letters, numbers and _ (for example ${lhs.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "new_column"} = …).` : line.startsWith("=") ? "Start with the name of the new column, then = and the formula, for example  total = column_total(sales)" : "Write each line as  new_column = formula" }); return; }
    try { const ast = fxParse(fxWrapCols(sp.expr, Object.keys(cols))); const v = fxEval(ast, { cols, n, groups, datasets: opts.datasets }); const isNew = !(sp.name in cols); cols[sp.name] = v; if (isNew) { headers.push(sp.name); created.push(sp.name); }
      const filled = v.filter(x => !FXB(x)).length; results.push({ line: li + 1, ok: true, name: sp.name, created: isNew, filled, n }); }
    catch (e) { results.push({ line: li + 1, ok: false, name: sp.name, error: e.message }); } };
  let k = 0, lastLine = 0;
  // a command such as to_bootstrap can run in many small steps (o.iter), so Stop works during it
  const runPending = () => { const { o, li } = pending; try { if (o.iter()) return; o.finish(); outs.push(o); results.push({ line: li + 1, ok: true, cmd: true, stata: true, msg: `to_${o.cmd}: ${o.msg || "see Results"}` }); } catch (e) { results.push({ line: li + 1, ok: false, error: e.message }); } pending = null; };
  const step = () => { if (pending) { runPending(); return true; } if (k >= LINES.length) return false; const L = LINES[k++]; lastLine = L.li + 1; body(L.raw, L.li); return true; };
  const result = () => { const fmt = (v) => typeof v === "number" ? (isFinite(v) ? String(+v.toPrecision(12)) : "") : (v ?? "");
    const rows = Array.from({ length: n }, (_, i) => headers.map(h => fmt(cols[h][i])));
    return { headers: headers.slice(), rows, results, created, changed, outs, unit: unitC, time: timeC, est }; };
  return { step, result, get done() { return k; }, get total() { return LINES.length; }, get lastLine() { return lastLine; }, get note() { return pending && pending.o.progress ? pending.o.progress() : ""; } };
};
// ══════════════════════════════════════════════
// ECOSCRIPT STATA-STYLE COMMANDS (to_reg, to_sum, to_tab, ...)
// Each Stata command has an EcoScript twin named to_<command>. Same syntax:
//   to_cmd varlist [if condition] [in a/b] [, options]
// Conditions use EcoScript (==, !=, and, or, functions). Results go to the Results panel.
// ══════════════════════════════════════════════
const ST_ALIAS = { regress: "reg", ols: "reg", summarize: "sum", summ: "sum", su: "sum", tabulate: "tab", ta: "tab", tab1: "tab", tab2: "tab", correlate: "corr", cor: "corr",
  describe: "describe", des: "describe", codebook: "describe", generate: "gen", g: "gen", ren: "rename", logistic: "logit", ivregress: "ivreg", ivreg2: "ivreg", areg: "reghdfe", oneway: "anova",
  estout: "esttab", outreg: "esttab", outreg2: "esttab", histogram: "hist", graph_bar: "bar", graph_hbar: "hbar", graph_box: "box", graph_pie: "pie", twoway_scatter: "scatter", twoway_line: "line",
  dedupe: "duplicates", di: "display", misstable: "missing", mdesc: "missing", winsor2: "winsor" };
// d: what it does (plain English); syn: syntax; st: the Stata command it mirrors; g: help group
const ST_CMDS = {
  sum: { st: "summarize", g: "Describe data", syn: "to_sum gdp inflation [if year >= 2010] [, detail by(region)]", d: "Count, mean, standard deviation, min and max (detail adds percentiles, skewness, kurtosis)" },
  describe: { st: "describe", g: "Describe data", syn: "to_describe [varlist]", d: "Each column: type, filled, missing, distinct values, an example" },
  tab: { st: "tabulate", g: "Describe data", syn: "to_tab region [sector] [, chi2 row col]", d: "Frequency table; two variables give a cross-table (chi2 adds the Pearson test)" },
  corr: { st: "correlate", g: "Describe data", syn: "to_corr gdp inflation debt [, graph]", d: "Correlation matrix on rows complete for all variables (graph draws a heatmap)" },
  pwcorr: { st: "pwcorr", g: "Describe data", syn: "to_pwcorr gdp inflation debt [, sig obs]", d: "Pairwise correlations, each pair using all its rows; sig adds p-values" },
  count: { st: "count", g: "Describe data", syn: "to_count [if gdp > 1000]", d: "Number of rows (that meet a condition)" },
  list: { st: "list", g: "Describe data", syn: "to_list country year gdp [if ...] [in 1/20]", d: "Show rows (first 50 unless in a/b is given)" },
  missing: { st: "misstable summarize", g: "Describe data", syn: "to_missing [varlist]", d: "Blanks per column, sorted from most missing" },
  ci: { st: "ci means", g: "Describe data", syn: "to_ci gdp inflation [, level(90)]", d: "Mean with standard error and confidence interval" },
  reg: { st: "regress", g: "Estimate", syn: "to_reg y x1 x2 i.region L.x [if] [, robust vce(cluster id) noconstant name(m1)]", d: "Linear regression (OLS) with classic, robust or clustered standard errors. i.var adds dummies; L. D. F. are lag, difference, lead" },
  xtreg: { st: "xtreg, fe", g: "Estimate", syn: "to_xtreg y x1 x2 [, fe robust]", d: "Panel regression with unit fixed effects (needs to_xtset id time or the Group by box)" },
  reghdfe: { st: "reghdfe / areg", g: "Estimate", syn: "to_reghdfe y x1 x2, absorb(country year) [vce(cluster country)]", d: "Regression absorbing one or more sets of fixed effects" },
  logit: { st: "logit", g: "Estimate", syn: "to_logit y x1 x2 [, or robust vce(cluster id)]", d: "Logistic regression for a 0/1 outcome (or shows odds ratios)" },
  probit: { st: "probit", g: "Estimate", syn: "to_probit y x1 x2 [, robust]", d: "Probit regression for a 0/1 outcome" },
  ivreg: { st: "ivregress 2sls", g: "Estimate", syn: "to_ivreg y x1 (x2 = z1 z2) [, robust first]", d: "Two-stage least squares; first shows the first stage and its F statistic" },
  ttest: { st: "ttest", g: "Estimate", syn: "to_ttest gdp == 0  |  to_ttest a == b  |  to_ttest gdp, by(treated) [unequal]", d: "One-sample, paired or two-group t test" },
  anova: { st: "oneway / anova", g: "Estimate", syn: "to_anova y group", d: "One-way analysis of variance with group means" },
  predict: { st: "predict", g: "After estimation", syn: "to_predict yhat [, xb resid pr]", d: "New column with fitted values, residuals or probabilities from the last model" },
  test: { st: "test", g: "After estimation", syn: "to_test x1 x2  |  to_test x1 = x2", d: "Wald test that coefficients are zero (or equal)" },
  esttab: { st: "esttab / outreg2", g: "After estimation", syn: "to_esttab [m1 m2] [, t p latex title(\"...\") keep(x1 x2) drop(year=*)]", d: "Side-by-side table of every model in this script, with stars, N and R-squared" },
  coefplot: { st: "coefplot", g: "After estimation", syn: "to_coefplot [, drop(_cons)]", d: "Chart of the last model's coefficients with 95% intervals" },
  display: { st: "display", g: "After estimation", syn: "to_display 2 * _b[x1] + e(r2)   |   to_display column_average(gdp)", d: "Calculator: numbers, column functions, _b[x], _se[x], e(N), e(r2)" },
  gen: { st: "generate", g: "Change data", syn: "to_gen new = expression [if condition]", d: "New column from an EcoScript expression (rows failing the condition stay blank)" },
  replace: { st: "replace", g: "Change data", syn: "to_replace col = expression [if condition]", d: "Overwrite an existing column (only where the condition holds)" },
  egen: { st: "egen", g: "Change data", syn: "to_egen avg = mean(gdp), by(region)", d: "Group statistics: mean, total, count, sd, min, max, median, rank, group, tag, std, pctile(x, p(25)), rowmean, rowtotal, rowmax, rowmin, rowsd" },
  drop: { st: "drop", g: "Change data", syn: "to_drop col1 col2   |   to_drop if year < 2000", d: "Remove columns, or rows meeting a condition" },
  keep: { st: "keep", g: "Change data", syn: "to_keep country year gdp   |   to_keep if region == \"West\"", d: "Keep only these columns, or rows meeting a condition" },
  rename: { st: "rename", g: "Change data", syn: "to_rename old new", d: "Rename a column" },
  sort: { st: "sort", g: "Change data", syn: "to_sort country year", d: "Sort rows (ascending)" },
  gsort: { st: "gsort", g: "Change data", syn: "to_gsort -gdp country", d: "Sort with - for descending" },
  duplicates: { st: "duplicates", g: "Change data", syn: "to_duplicates report [vars]  |  to_duplicates drop [vars]", d: "Find or remove repeated rows" },
  destring: { st: "destring", g: "Change data", syn: "to_destring price revenue", d: "Turn text such as \"1,250\", \"45%\" or \"$3.2\" into numbers" },
  encode: { st: "encode", g: "Change data", syn: "to_encode region, gen(region_id)", d: "Number each distinct text value (1, 2, 3 ...) in a new column" },
  xtile: { st: "xtile", g: "Change data", syn: "to_xtile quart = income, n(4)", d: "Quantile groups 1..n" },
  winsor: { st: "winsor2", g: "Change data", syn: "to_winsor income [, p(0.01) replace]", d: "Cap extreme values at the p and 1-p percentiles (new column _w unless replace)" },
  collapse: { st: "collapse", g: "Change data", syn: "to_collapse (mean) gdp (sum) aid (count) n=gdp, by(region year)", d: "Replace the table with group statistics" },
  reshape: { st: "reshape", g: "Change data", syn: "to_reshape long gdp pop, i(country) j(year)   |   to_reshape wide gdp, i(country) j(year)", d: "Wide to long (gdp2010 gdp2011 → gdp by year) or back" },
  xtset: { st: "xtset", g: "Change data", syn: "to_xtset country year", d: "Declare panel unit and time (used by L. D. F., over-time functions and to_xtreg)" },
  tsset: { st: "tsset", g: "Change data", syn: "to_tsset year", d: "Declare the time column of a single series" },
  scatter: { st: "twoway scatter", g: "Graphs", syn: "to_scatter y x [x2] [, over(group) nofit]", d: "Scatter plot with fitted line; a third variable gives a 3D scatter (y is the height)" },
  line: { st: "twoway line", g: "Graphs", syn: "to_line y [y2] x [, over(group)]", d: "Line chart over time; with over() it can be shown in 3D ribbons" },
  bar: { st: "graph bar", g: "Graphs", syn: "to_bar y, over(region) [by(year) stat(sum)]", d: "Column chart of a statistic per group (2D or 3D)" },
  hbar: { st: "graph hbar", g: "Graphs", syn: "to_hbar y, over(region) [stat(sum)]", d: "Horizontal bars" },
  hist: { st: "histogram", g: "Graphs", syn: "to_hist x [, bins(30) over(group)]", d: "Histogram" },
  kdensity: { st: "kdensity", g: "Graphs", syn: "to_kdensity x [, over(group)]", d: "Smoothed density curve" },
  box: { st: "graph box", g: "Graphs", syn: "to_box y [, over(group)]", d: "Box plot (median, quartiles, outliers)" },
  pie: { st: "graph pie", g: "Graphs", syn: "to_pie y, over(group)", d: "Pie chart of totals per group" },
  heatmap: { st: "heatplot", g: "Graphs", syn: "to_heatmap y, over(row_var col_var) [stat(mean)]", d: "Heat map of a value across two categories (2D or 3D)" },
  surface: { st: "twoway contour", g: "Graphs", syn: "to_surface z, over(x_var depth_var)", d: "3D surface of a value across two variables" },
  help: { st: "help", g: "Help", syn: "to_help [command]", d: "List the to_ commands, or show one command's syntax" },
};
const ST_GROUPS = ["Describe data", "Estimate", "After estimation", "Change data", "Graphs", "Help"];
// ── parsing ──
const stOpen = { "(": ")", "[": "]", "{": "}" };
// index of the first top-level occurrence of ch (outside quotes and brackets), or -1
const stTopIdx = (s, ch) => { let d = 0, q = null; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === "`") { q = c; continue; } if (stOpen[c]) d++; else if (")]}".includes(c)) d--; else if (c === ch && d === 0) return i; } return -1; };
const stTopWord = (s, w) => { let d = 0, q = null; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === "`") { q = c; continue; } if (stOpen[c]) d++; else if (")]}".includes(c)) d--;
  else if (d === 0 && (i === 0 || /\s/.test(s[i - 1])) && s.slice(i, i + w.length).toLowerCase() === w && (i + w.length === s.length || /\s/.test(s[i + w.length]))) return i; } return -1; };
const stTokens = (s) => { const out = []; let cur = "", d = 0, q = null; for (const c of s) { if (q) { cur += c; if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; } if (stOpen[c]) d++; else if (")]}".includes(c)) d--;
  if (/\s/.test(c) && d === 0) { if (cur) out.push(cur); cur = ""; } else cur += c; } if (cur) out.push(cur); return out; };
const stUnq = (x) => { x = String(x || "").trim(); const o = x[0]; if (FX_Q[o] && x.endsWith(FX_Q[o]) && x.length > 1) return x.slice(1, -1).trim(); return x; };
// "a b(c d) e" -> { a:true, b:"c d", e:true }
const stOpts = (s) => { const o = {}; stTokens(s || "").forEach(t => { const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s); if (m) o[m[1].toLowerCase()] = m[2].trim(); else o[t.toLowerCase()] = true; }); return o; };
const stParse = (rest) => { let main = rest, opt = ""; const ci = stTopIdx(rest, ","); if (ci >= 0) { main = rest.slice(0, ci); opt = rest.slice(ci + 1); }
  let range = null; const inRe = /(?:^|\s)in\s+(-?\d+|f)(?:\s*\/\s*(-?\d+|l))?\s*(?=\s|$)/i; const im = main.match(inRe); if (im && stTopWord(main, "in") >= 0) { range = [im[1], im[2] || im[1]]; main = main.replace(inRe, " "); }
  let cond = null; const ii = stTopWord(main, "if"); if (ii >= 0) { cond = main.slice(ii + 2).trim(); main = main.slice(0, ii); }
  return { main: main.trim(), cond, range, opts: stOpts(opt), optRaw: opt.trim() }; };
const stFmt = (v, sig = 6) => { if (v == null || v === "") return ""; if (typeof v !== "number") return String(v); if (!isFinite(v)) return "."; if (v === 0) return "0"; const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-5) return v.toExponential(3); if (Number.isInteger(v) && a < 1e12) return v.toLocaleString("en-US"); return String(+v.toPrecision(sig)); };
const stP = (p) => !isFinite(p) ? "." : p < 0.0005 ? "0.000" : p.toFixed(3);
const stStars = (p) => p < 0.01 ? "***" : p < 0.05 ? "**" : p < 0.1 ? "*" : "";
// ── linear algebra ──
const stInv = (A) => { const n = A.length; const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-14) return null; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r.slice(n)); };
// columns of X (row arrays) that are not linear combinations of earlier ones
const stKeepCols = (X) => { const k = X[0] ? X[0].length : 0; const G = meZeros(k, k); for (const r of X) for (let a = 0; a < k; a++) { const v = r[a]; if (!v) continue; for (let b = a; b < k; b++) G[a][b] += v * r[b]; } for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) G[a][b] = G[b][a];
  const keep = []; for (let j = 0; j < k; j++) { if (!(G[j][j] > 1e-12)) continue; if (!keep.length) { keep.push(j); continue; } const S = keep.map(a => keep.map(b => G[a][b])); const inv = stInv(S); if (!inv) continue;
    const g = keep.map(a => G[a][j]); let q = 0; for (let a = 0; a < keep.length; a++) for (let b = 0; b < keep.length; b++) q += g[a] * inv[a][b] * g[b]; if (G[j][j] - q > 1e-9 * G[j][j]) keep.push(j); }
  return keep; };
// ── the command runner. S: state from fxRun ──
// "y x1 (x2 = z1 z2) x3" -> [whole, "y x1 ", "x2 ", " z1 z2", " x3"]: the first ( ) group outside [names] and quotes that holds "="
const stIvSplit = (txt) => { let q = null, d = 0, a = -1; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === q) q = null; continue; } if (c === "[") { q = "]"; continue; } if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "(") { if (d === 0) a = i; d++; } else if (c === ")" && d > 0) { d--; if (d === 0 && a >= 0) { const inner = txt.slice(a + 1, i); let e = -1, qq = null, dd = 0; for (let k = 0; k < inner.length; k++) { const ch = inner[k]; if (qq) { if (ch === qq) qq = null; continue; } if (ch === "[") { qq = "]"; continue; } if (ch === "(") dd++; else if (ch === ")") dd--; else if (ch === "=" && dd === 0) { e = k; break; } }
      if (e >= 0) return [txt, txt.slice(0, a), inner.slice(0, e), inner.slice(e + 1), txt.slice(i + 1)]; a = -1; } } } return null; };
// a Stata-style line without the to_ prefix -> { name, rest }, or null when the first word is not a command (formulas such as  gdp_pc = gdp / pop  stay formulas)
const stBare = (line) => { let s = line.replace(/^(quietly|qui|noisily|noi|capture|cap)\s*:?\s+/i, "").replace(/^xi\s*:\s*/i, "");
  let m = s.match(/^(?:graph\s+twoway|twoway|tw)\s+([A-Za-z]+)\b(.*)$/is); if (m) { m[2] = m[2].split("||")[0]; const w = m[1].toLowerCase(); const map = { lfit: "scatter", qfit: "scatter", lfitci: "scatter", connected: "line", tsline: "line", area: "line", bar: "bar" }; return { name: map[w] || w, rest: m[2] }; }
  m = s.match(/^graph\s+(bar|hbar|box|hbox|pie|dot|matrix)\b(.*)$/is); if (m) { const w = m[1].toLowerCase(); return { name: w === "hbox" ? "box" : w === "matrix" ? "corr" : w, rest: w === "matrix" ? `${m[2]}, graph` : m[2] }; }
  m = s.match(/^ivregress\s+(?:2sls|liml|gmm)\s+(.*)$/is); if (m) return { name: "ivreg", rest: m[1] };
  m = s.match(/^tsline\s+(.*)$/is); if (m) return { name: "line", rest: m[1] };
  m = s.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\s+(.*)|\s*(,.*)|\s*(:.*))?$/s); if (!m) return null; const w = m[1].toLowerCase(); const rest = m[2] || m[3] || m[4] || "";
  if (!(ST_CMDS[w] || ST_ALIAS[w])) return null; if (/^\s*=(?!=)/.test(rest)) return null; // "count = ..." is a formula
  if (/^\s*\(/.test(rest) && !["ivreg", "ivregress", "collapse", "bysort", "by", "display", "di"].includes(w)) return null; // "round(x)" etc. are functions
  return { name: w, rest }; };
// put [ ] around column names with spaces or symbols, so  to_reg GDP per Capita (USD) Employment (%)  works without brackets
const stWrapNames = (txt, names) => { const odd = names.filter(h => h && /[^A-Za-z0-9_.]/.test(h) && h.trim() === h).sort((a, b) => b.length - a.length); if (!odd.length || !txt) return txt;
  const low = txt.toLowerCase(), oddL = odd.map(h => h.toLowerCase()); let out = "", i = 0, q = null;
  while (i < txt.length) { const c = txt[i]; if (q) { out += c; if (c === q) q = null; i++; continue; } if (FX_Q[c]) { q = FX_Q[c]; out += c; i++; continue; }
    const prev = txt[i - 1] || ""; let hit = -1; if (!/[A-Za-z0-9_]/.test(prev)) for (let k = 0; k < odd.length; k++) { if (low.startsWith(oddL[k], i) && !/[A-Za-z0-9_]/.test(txt[i + odd[k].length] || "")) { hit = k; break; } }
    if (hit >= 0) { out += "[" + odd[hit] + "]"; i += odd[hit].length; } else { out += c; i++; } }
  return out; };
const stRun = (name, rest, S, line) => {
  const cmd = ST_CMDS[name] ? name : ST_ALIAS[name] || null; if (!cmd || !ST_CMDS[cmd]) { const close = Object.keys(ST_CMDS).find(k => k.startsWith(name.slice(0, 2))); throw new Error(`Unknown command to_${name}.${close ? ` Did you mean to_${close}?` : ""} Type to_help to see them all.`); }
  rest = stWrapNames(rest, S.headers); const P = stParse(rest); const O = P.opts; const out = { line, cmd, title: `to_${cmd} ${rest}`.trim(), blocks: [] }; const add = (b) => out.blocks.push(b);
  const n = S.n; const H = () => S.headers;
  const col = (nm) => { const h = S.findCol(stUnq(nm)); if (!h) throw new Error(`No column called "${stUnq(nm)}".`); return h; };
  const numv = (h) => S.cols[h].map(fxNum);
  // expand a varlist: names, wildcards (y20*), ranges (a-b), quoted names
  const vars = (txt, { need = 0, max = Infinity } = {}) => { const out2 = []; const whole = S.findCol(stUnq(String(txt || "").trim())); (whole ? [`[${whole}]`] : stTokens(txt || "")).forEach(tok => { const t = stUnq(tok); if (!t) return;
      if (t === "_all" || t === "*") { out2.push(...H()); return; }
      if (/[*?]/.test(t)) { const re = new RegExp("^" + t.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i"); const hit = H().filter(h => re.test(h)); if (!hit.length) throw new Error(`No column matches ${t}.`); out2.push(...hit); return; }
      const h = S.findCol(t); if (h) { out2.push(h); return; }
      const rm = t.match(/^([^-]+)-([^-]+)$/); if (rm && S.findCol(rm[1]) && S.findCol(rm[2])) { const a = H().indexOf(S.findCol(rm[1])), b = H().indexOf(S.findCol(rm[2])); out2.push(...H().slice(Math.min(a, b), Math.max(a, b) + 1)); return; }
      throw new Error(`No column called "${t}". Columns with spaces or symbols go in [brackets].`); });
    const u = [...new Set(out2)]; if (u.length < need) throw new Error(`to_${cmd} needs at least ${need} variable${need > 1 ? "s" : ""}. Syntax: ${ST_CMDS[cmd].syn}`); if (u.length > max) throw new Error(`to_${cmd} takes at most ${max} variable${max > 1 ? "s" : ""}. Syntax: ${ST_CMDS[cmd].syn}`); return u; };
  // rows in the sample: if / in
  const sample = () => { const m = new Uint8Array(n).fill(1); if (P.cond) { const v = S.evalExpr(P.cond).map(fxTruth); for (let i = 0; i < n; i++) if (v[i] !== 1) m[i] = 0; }
    if (P.range) { const lo = P.range[0] === "f" ? 1 : +P.range[0], hi = P.range[1] === "l" ? n : +P.range[1]; const a = lo < 0 ? n + lo + 1 : lo, b = hi < 0 ? n + hi + 1 : hi; for (let i = 0; i < n; i++) if (i + 1 < a || i + 1 > b) m[i] = 0; } return m; };
  // regression terms: x, i.g (dummies, first level omitted), L.x L2.x D.x F.x, c.x
  const lagged = (vals, k) => { const o = new Array(n).fill(NaN); S.groups().forEach(g => g.forEach((i, q) => { const j = q - k; if (j >= 0 && j < g.length) o[i] = vals[g[j]]; })); return o; };
  const terms = (txt) => { const T = []; stTokens(txt || "").forEach(tok => { const t = stUnq(tok); let m;
      if ((m = t.match(/^i\.(.+)$/i))) { const vs = vars(m[1]); vs.forEach(h => { const raw = S.cols[h]; const lab = new Map(); raw.forEach(x => { const k = fxKey(x); if (k !== "" && !lab.has(k)) lab.set(k, fxS(x).trim()); }); const lv = [...lab.keys()].sort((a, b) => { const x = +a, y = +b; return isFinite(x) && isFinite(y) ? x - y : a.localeCompare(b); });
        if (lv.length > 200) throw new Error(`i.${h} would add ${lv.length - 1} dummies; use to_reghdfe ..., absorb(${h}) instead.`);
        const keys = raw.map(fxKey); lv.slice(1).forEach(l => T.push({ name: `${h}=${lab.get(l)}`, v: keys.map(k => k === "" ? NaN : +(k === l)), base: lab.get(lv[0]) })); }); return; }
      if ((m = t.match(/^((?:[LDF]\d*\.)+)(.+)$/i))) { const ops = m[1].split(".").filter(Boolean).map(o => ({ op: o[0].toUpperCase(), k: +(o.slice(1) || 1) })); vars(m[2]).forEach(h => { let v = numv(h);
        for (let q = ops.length - 1; q >= 0; q--) { const { op, k } = ops[q]; if (op === "L") v = lagged(v, k); else if (op === "F") v = lagged(v, -k); else { for (let r = 0; r < k; r++) { const l = lagged(v, 1); v = v.map((a, i) => a - l[i]); } } }
        T.push({ name: `${m[1]}${h}`, v }); }); return; }
      if ((m = t.match(/^c\.(.+)$/i))) { vars(m[1]).forEach(h => T.push({ name: h, v: numv(h) })); return; }
      if ((m = t.match(/^(.+)#(.+)$/))) { const a = vars(m[1].replace(/^c\./i, ""), { max: 1 })[0], b = vars(m[2].replace(/^c\./i, ""), { max: 1 })[0]; const x = numv(a), y = numv(b); T.push({ name: `${a}#${b}`, v: x.map((p, i) => p * y[i]) }); return; }
      vars(tok).forEach(h => T.push({ name: h, v: numv(h) })); }); return T; };
  const clusterOf = () => { const c = O.vce && String(O.vce).match(/^cl(?:uster)?\s+(.+)$/i); const name = c ? c[1] : O.cluster && O.cluster !== true ? O.cluster : null; return name ? col(name) : null; };
  const seLabel = (cl, rob) => cl ? `Std. err. adjusted for ${S.est.lastG || "?"} clusters in ${cl}` : rob ? "Robust standard errors (HC1)" : "Conventional standard errors";
  const coefTable = (names, b, se, df, isZ) => { const crit = isZ ? 1.959963984540054 : meTQuant(0.975, df); return { type: "table", head: ["", "Coefficient", "Std. err.", isZ ? "z" : "t", isZ ? "P>|z|" : "P>|t|", "[95% conf.", "interval]"], num: true,
      rows: names.map((nm, j) => { const t = b[j] / se[j]; const p = isZ ? 2 * (1 - meNormCdf(Math.abs(t))) : meTPval(t, df); return [nm, stFmt(b[j], 7) + stStars(p), stFmt(se[j], 7), stFmt(t, 4), stP(p), stFmt(b[j] - crit * se[j], 7), stFmt(b[j] + crit * se[j], 7)]; }) }; };
  const store = (e) => { S.est.models.push(e); S.est.last = e; e.name = (O.name && O.name !== true) ? O.name : `m${S.est.models.length}`; out.msg = `${e.title}: N = ${e.N.toLocaleString()}${e.r2 != null ? `, R² = ${e.r2.toFixed(3)}` : ""} (stored as ${e.name})`; };
  const kv = (items) => add({ type: "kv", items: items.filter(Boolean) });
  const chart = (title, cols, t, t3d) => { const m = sample(); const rows = []; const J = cols.map(h => H().indexOf(h)); for (let i = 0; i < n; i++) if (m[i]) rows.push(J.map(j => S.cols[H()[j]][i])); add({ type: "chart", title, tab: { headers: cols, rows }, t, t3d }); out.msg = `${title} · ${rows.length.toLocaleString()} rows`; };
  const groupKeys = (byList) => { if (!byList.length) return new Array(n).fill(""); return Array.from({ length: n }, (_, i) => byList.map(h => fxKey(S.cols[h][i])).join("\u0001")); };

  switch (cmd) {
    case "help": { const want = stUnq(P.main).replace(/^to_/, ""); const c = ST_CMDS[want] || ST_CMDS[ST_ALIAS[want]];
      if (want && c) { add({ type: "text", text: `${c.syn}\n\n${c.d}.` }); out.msg = `help for to_${want}`; break; }
      add({ type: "table", head: ["Command", "What it does"], rows: Object.entries(ST_CMDS).map(([k, c]) => [`to_${k}`, c.d]) }); out.msg = `${Object.keys(ST_CMDS).length} commands`; break; }

    case "sum": { const vs = vars(P.main || "_all"); const m = sample(); const by = O.by ? vars(O.by) : []; const keys = groupKeys(by); const gl = [...new Set(keys.filter((_, i) => m[i]))];
      const one = (h, rowsIn) => { const x = []; const raw = S.cols[h]; for (const i of rowsIn) { const v = fxNum(raw[i]); if (isFinite(v)) x.push(v); } const N = x.length; const mean = N ? x.reduce((a, b) => a + b, 0) / N : NaN; let s2 = 0, s3 = 0, s4 = 0; for (const v of x) { const d = v - mean; s2 += d * d; s3 += d * d * d; s4 += d * d * d * d; }
        const sd = N > 1 ? Math.sqrt(s2 / (N - 1)) : NaN; const srt = x.slice().sort((a, b) => a - b); const q = (f) => { if (!N) return NaN; const hh = (N - 1) * f, lo = Math.floor(hh); return srt[lo] + (srt[Math.min(lo + 1, N - 1)] - srt[lo]) * (hh - lo); };
        return { N, mean, sd, min: N ? srt[0] : NaN, max: N ? srt[N - 1] : NaN, q, srt, skew: N > 2 ? (s3 / N) / Math.pow(s2 / N, 1.5) : NaN, kurt: N > 3 ? (s4 / N) / Math.pow(s2 / N, 2) : NaN, v: sd * sd }; };
      const rowsOf = (g) => { const r = []; for (let i = 0; i < n; i++) if (m[i] && keys[i] === g) r.push(i); return r; };
      const labs = by.map(h => { const L = new Map(); S.cols[h].forEach(v => { const k = fxKey(v); if (k !== "" && !L.has(k)) L.set(k, fxS(v).trim()); }); return L; });
      for (const g of gl) { const R = rowsOf(g); const lab = by.length ? `${by.join(", ")} = ${g.split("\u0001").map((k, q) => labs[q].get(k) ?? k).join(", ")}` : null;
        if (O.detail || O.d) { vs.forEach(h => { const s = one(h, R); add({ type: "table", caption: `${h}${lab ? ` · ${lab}` : ""}`, head: ["Percentile", "Value", "", "Statistic", "Value"], num: true,
            rows: [[1, .01], [5, .05], [10, .1], [25, .25], [50, .5], [75, .75], [90, .9], [95, .95], [99, .99]].map(([p, f], k) => [`${p}%`, stFmt(s.q(f)), "", ["Obs", "Mean", "Std. dev.", "Variance", "Skewness", "Kurtosis", "Smallest", "Largest", ""][k], stFmt([s.N, s.mean, s.sd, s.v, s.skew, s.kurt, s.min, s.max, null][k])]) }); }); }
        else add({ type: "table", caption: lab, head: ["Variable", "Obs", "Mean", "Std. dev.", "Min", "Max"], num: true, rows: vs.map(h => { const s = one(h, R); return [h, stFmt(s.N), stFmt(s.mean), stFmt(s.sd), stFmt(s.min), stFmt(s.max)]; }) }); }
      if (gl.length) { const s = one(vs[vs.length - 1], rowsOf(gl[gl.length - 1])); S.est.r = { N: s.N, mean: s.mean, sd: s.sd, Var: s.v, min: s.min, max: s.max, sum: s.mean * s.N, p1: s.q(.01), p5: s.q(.05), p10: s.q(.1), p25: s.q(.25), p50: s.q(.5), p75: s.q(.75), p90: s.q(.9), p95: s.q(.95), p99: s.q(.99), skewness: s.skew, kurtosis: s.kurt }; }
      out.msg = `summary of ${vs.length} variable${vs.length > 1 ? "s" : ""}${by.length ? ` in ${gl.length} groups` : ""}`; break; }

    case "describe": case "missing": { const vs = vars(P.main || "_all"); const rows = vs.map(h => { const raw = S.cols[h]; let f = 0, num = 0, dt = 0; const set = new Set(); let ex = "";
        for (const v of raw) { if (FXB(v)) continue; f++; if (isFinite(fxNum(v))) num++; else if (isFinite(fxDate(v))) dt++; if (set.size < 100001) set.add(fxKey(v)); if (!ex) ex = fxS(v); }
        const ty = !f ? "empty" : num / f > 0.95 ? "number" : dt / f > 0.9 ? "date" : "text"; return { h, ty, f, miss: n - f, d: set.size > 100000 ? "100,000+" : set.size.toLocaleString(), ex }; });
      if (cmd === "missing") { const r2 = rows.filter(r => r.miss > 0).sort((a, b) => b.miss - a.miss); add({ type: "table", head: ["Variable", "Missing", "% missing", "Filled"], num: true, rows: r2.map(r => [r.h, r.miss.toLocaleString(), (r.miss / Math.max(1, n) * 100).toFixed(1) + "%", r.f.toLocaleString()]) });
        if (!r2.length) add({ type: "text", text: "No blanks in these columns." }); out.msg = `${r2.length} of ${rows.length} columns have blanks`; break; }
      kv([["Observations", n.toLocaleString()], ["Variables", H().length]]); add({ type: "table", head: ["Variable", "Type", "Filled", "Missing", "Distinct", "Example"], rows: rows.map(r => [r.h, r.ty, r.f.toLocaleString(), r.miss.toLocaleString(), r.d, String(r.ex).slice(0, 40)]) });
      out.msg = `${n.toLocaleString()} rows, ${H().length} columns`; break; }

    case "count": { const m = sample(); const c = m.reduce((a, b) => a + b, 0); add({ type: "text", text: `  ${c.toLocaleString()}` }); out.msg = `${c.toLocaleString()} rows${P.cond ? " meet the condition" : ""}`; S.est.scalars.count = c; break; }

    case "list": { const vs = vars(P.main || "_all"); const m = sample(); const idx = []; for (let i = 0; i < n && idx.length < (P.range ? 5000 : 50); i++) if (m[i]) idx.push(i); const tot = m.reduce((a, b) => a + b, 0);
      add({ type: "table", head: ["#", ...vs], rows: idx.map(i => [i + 1, ...vs.map(h => fxS(S.cols[h][i]))]), note: tot > idx.length ? `Showing ${idx.length} of ${tot.toLocaleString()} rows. Add  in 1/200  to see more.` : null }); out.msg = `${idx.length} rows listed`; break; }

    case "tab": { const vs = vars(P.main, { need: 1, max: 2 }); const m = sample(); const key = (h, i) => { const v = S.cols[h][i]; return FXB(v) ? null : fxS(v); };
      const order = (arr) => arr.sort((a, b) => { const x = +a, y = +b; return isFinite(x) && isFinite(y) ? x - y : String(a).localeCompare(String(b)); });
      if (vs.length === 1) { const c = new Map(); let N = 0; for (let i = 0; i < n; i++) { if (!m[i]) continue; const k = key(vs[0], i); if (k == null && !O.missing) continue; const kk = k ?? "."; c.set(kk, (c.get(kk) || 0) + 1); N++; }
        let cum = 0; const ks = order([...c.keys()]); if (ks.length > 500) throw new Error(`${vs[0]} has ${ks.length} different values; a frequency table needs 500 or fewer. Try to_xtile or to_hist.`);
        add({ type: "table", head: [vs[0], "Freq.", "Percent", "Cum."], num: true, rows: [...ks.map(k => { const f = c.get(k); cum += f; return [k, f.toLocaleString(), (f / N * 100).toFixed(2), (cum / N * 100).toFixed(2)]; }), ["Total", N.toLocaleString(), "100.00", ""]] });
        out.msg = `${ks.length} values, ${N.toLocaleString()} rows`; break; }
      const [a, b] = vs; const cell = new Map(); const ra = new Map(), rb = new Map(); let N = 0;
      for (let i = 0; i < n; i++) { if (!m[i]) continue; const x = key(a, i), y = key(b, i); if (x == null || y == null) continue; const k = x + "\u0001" + y; cell.set(k, (cell.get(k) || 0) + 1); ra.set(x, (ra.get(x) || 0) + 1); rb.set(y, (rb.get(y) || 0) + 1); N++; }
      const A = order([...ra.keys()]), B = order([...rb.keys()]); if (A.length * B.length > 3000) throw new Error("Too many combinations for a cross-table (more than 3,000 cells).");
      const pc = (f, d) => O.row ? ` (${(f / d.r * 100).toFixed(1)}%)` : O.col || O.column ? ` (${(f / d.c * 100).toFixed(1)}%)` : "";
      add({ type: "table", head: [`${a} \\ ${b}`, ...B, "Total"], num: true, rows: [...A.map(x => [x, ...B.map(y => { const f = cell.get(x + "\u0001" + y) || 0; return f.toLocaleString() + pc(f, { r: ra.get(x), c: rb.get(y) }); }), ra.get(x).toLocaleString()]), ["Total", ...B.map(y => rb.get(y).toLocaleString()), N.toLocaleString()]] });
      if (O.chi2 || O.all) { let X2 = 0; A.forEach(x => B.forEach(y => { const e = ra.get(x) * rb.get(y) / N; const o = cell.get(x + "\u0001" + y) || 0; X2 += (o - e) ** 2 / e; })); const df = (A.length - 1) * (B.length - 1); kv([["Pearson chi2(" + df + ")", stFmt(X2, 5)], ["Pr", stP(meChi2Pval(X2, df))]]); }
      out.msg = `${A.length} × ${B.length} table, ${N.toLocaleString()} rows`; break; }

    case "corr": case "pwcorr": { const vs = vars(P.main || "_all").filter(h => S.cols[h].some(v => isFinite(fxNum(v)))); if (vs.length < 2) throw new Error("Correlation needs at least two numeric variables.");
      const m = sample(); const X = vs.map(numv); const pair = (a, b, listw) => { let k = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < n; i++) { if (!m[i]) continue; if (listw && !listw[i]) continue; const x = X[a][i], y = X[b][i]; if (!isFinite(x) || !isFinite(y)) continue; k++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; }
        const r = (k * sab - sa * sb) / Math.sqrt((k * saa - sa * sa) * (k * sbb - sb * sb)); return { r, k }; };
      let lw = null; if (cmd === "corr") { lw = new Uint8Array(n); let N = 0; for (let i = 0; i < n; i++) if (m[i] && X.every(c => isFinite(c[i]))) { lw[i] = 1; N++; } kv([["Observations used (complete for all)", N.toLocaleString()]]); }
      const R = vs.map((_, a) => vs.map((_, b) => pair(a, b, lw)));
      add({ type: "table", head: ["", ...vs], num: true, rows: vs.map((h, a) => [h, ...vs.map((_, b) => b > a ? "" : (() => { const c = R[a][b]; let s = isFinite(c.r) ? c.r.toFixed(4) : "."; if (cmd === "pwcorr" && a !== b) { const t = c.r * Math.sqrt((c.k - 2) / Math.max(1e-12, 1 - c.r * c.r)); const p = meTPval(t, c.k - 2); if (O.star) s += p < (+O.star || 0.05) ? "*" : ""; if (O.sig) s += `\n(${stP(p)})`; if (O.obs) s += `\n${c.k}`; } return s; })())]) });
      if (O.graph) { const cols = vs.slice(0, 20); const rows = []; for (let i = 0; i < n; i++) if (m[i] && (!lw || lw[i])) rows.push(cols.map(h => S.cols[h][i])); add({ type: "chart", title: "Correlation heat map", tab: { headers: cols, rows }, t: { type: "corr", ys: cols, opts: {} } }); }
      out.msg = `${vs.length} × ${vs.length} correlation matrix`; break; }

    case "ci": { const vs = vars(P.main, { need: 1 }); const lev = +O.level || 95; const m = sample(); add({ type: "table", head: ["Variable", "Obs", "Mean", "Std. err.", `[${lev}% conf.`, "interval]"], num: true,
        rows: vs.map(h => { const x = numv(h).filter((v, i) => m[i] && isFinite(v)); const N = x.length; const mu = x.reduce((a, b) => a + b, 0) / N; const sd = Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1)); const se = sd / Math.sqrt(N); const c = meTQuant(1 - (1 - lev / 100) / 2, N - 1); return [h, N, stFmt(mu), stFmt(se), stFmt(mu - c * se), stFmt(mu + c * se)]; }) });
      out.msg = `confidence intervals for ${vs.length} variable${vs.length > 1 ? "s" : ""}`; break; }

    case "reg": case "xtreg": case "reghdfe": { const tk = terms(P.main); if (tk.length < 1) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); const y = tk[0], xs = tk.slice(1); const m = sample();
      const fe = cmd === "xtreg" ? (S.unit ? [S.unit] : (() => { throw new Error("to_xtreg needs the panel unit. Add  to_xtset country year  above it, or choose Group by (unit)."); })()) : cmd === "reghdfe" ? (O.absorb && O.absorb !== true ? vars(O.absorb) : (() => { throw new Error("to_reghdfe needs absorb(...), for example  to_reghdfe y x, absorb(country year)"); })()) : [];
      if (cmd === "xtreg" && (O.re || O.be)) throw new Error("Only fixed effects (fe) are available in to_xtreg. For random effects, compare with to_reg ... , vce(cluster id).");
      let cl = clusterOf(); if (cmd === "xtreg" && (O.robust || O.r) && !cl) cl = S.unit;
      const use = []; for (let i = 0; i < n; i++) { if (!m[i] || !isFinite(y.v[i]) || xs.some(t => !isFinite(t.v[i]))) continue; if (cl && FXB(S.cols[cl][i])) continue; if (fe.some(h => FXB(S.cols[h][i]))) continue; use.push(i); }
      const cons = !fe.length && !O.noconstant && !O.nocons; let names = xs.map(t => t.name); let X = use.map(i => xs.map(t => t.v[i])); if (cons) { X = X.map(r => [...r, 1]); names = [...names, "_cons"]; }
      if (use.length <= names.length) throw new Error(`Not enough rows: ${use.length} complete rows for ${names.length} coefficients.`);
      const keep = fe.length ? names.map((_, j) => j) : stKeepCols(X); const omitted = names.filter((_, j) => !keep.includes(j)); if (omitted.length) { X = X.map(r => keep.map(j => r[j])); names = keep.map(j => names[j]); }
      const yv = use.map(i => y.v[i]); const cv = cl ? use.map(i => fxKey(S.cols[cl][i])) : null; let r;
      if (fe.length) { const Xc = names.map((_, j) => X.map(row => row[j])); if (!Xc.length) throw new Error("Add at least one explanatory variable."); r = meFEReg(yv, Xc, fe.map(h => use.map(i => fxKey(S.cols[h][i]))), cv, null, cl && fe.includes(cl) ? [fe.indexOf(cl)] : []); }
      else r = meOLS(X, yv, { cluster: cv });
      const rob = !!(O.robust || O.r || O.vce === "robust" || O.vce === "r"); let V = r.V, se = r.se, df = r.df;
      if (fe.length) { const lv = fe.reduce((a, h) => a + new Set(use.map(i => fxKey(S.cols[h][i]))).size, 0) - (fe.length - 1); r.sigma2 = r.ssr / Math.max(1, r.n - r.k - lv); }
      if (!cl && !rob) { V = r.XtXinv.map(row => row.map(v => v * r.sigma2)); se = V.map((row, j) => Math.sqrt(Math.max(0, row[j]))); df = r.n - r.K; }
      S.est.lastG = r.G; const ybar = yv.reduce((a, b) => a + b, 0) / yv.length; const tss = fe.length ? r.yd.reduce((a, b) => a + b * b, 0) : cons ? yv.reduce((a, b) => a + (b - ybar) ** 2, 0) : yv.reduce((a, b) => a + b * b, 0);
      const r2 = 1 - r.ssr / tss; const kS = names.filter(x => x !== "_cons").length; const ar2 = 1 - (1 - r2) * (r.n - (cons ? 1 : 0)) / Math.max(1, r.n - r.K);
      const slope = names.map((x, j) => x === "_cons" ? -1 : j).filter(j => j >= 0); const W = slope.length ? meWald(r.beta, V, slope, df) : null;
      kv([["Number of obs", r.n.toLocaleString()], W && [`F(${W.df}, ${df})`, stFmt(W.F, 5)], W && ["Prob > F", stP(W.pF)], [fe.length ? "R-squared (within)" : "R-squared", r2.toFixed(4)], !fe.length && ["Adj R-squared", ar2.toFixed(4)], ["Root MSE", stFmt(Math.sqrt(r.sigma2), 5)],
        fe.length && ["Absorbed", fe.map(h => `${h} (${new Set(use.map(i => fxKey(S.cols[h][i]))).size})`).join(", ")], cl && ["Clusters", `${r.G} in ${cl}`]]);
      add({ ...coefTable(names, r.beta, se, df, false), caption: `${y.name}` });
      add({ type: "note", text: `${seLabel(cl, rob)}.${omitted.length ? ` Omitted because of collinearity: ${omitted.join(", ")}.` : ""}${xs.filter(t => t.base != null).length ? ` Base levels: ${[...new Set(xs.filter(t => t.base != null).map(t => t.name.split("=")[0] + "=" + t.base))].join(", ")}.` : ""}${fe.length ? " The constant is absorbed by the fixed effects." : ""}` });
      const all = names.map(nm => nm === "_cons" ? null : (xs.find(t => t.name === nm) || {}).v);
      store({ cmd, title: `${cmd === "reg" ? "OLS" : "Fixed effects"} of ${y.name}`, depvar: y.name, yvec: y.v, names, b: r.beta, se, V, df, N: r.n, r2, ar2, F: W && W.F, rmse: Math.sqrt(r.sigma2), isZ: false, vecs: all, n0: n, fe, use, resid: r.resid, link: "id", rss: r.sigma2 * df });
      break; }

    case "logit": case "probit": { const tk = terms(P.main); if (tk.length < 2) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); const y = tk[0], xs = tk.slice(1); const m = sample(); const cl = clusterOf(); const rob = !!(O.robust || O.r || O.vce === "robust");
      const use = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(y.v[i]) && xs.every(t => isFinite(t.v[i])) && (!cl || !FXB(S.cols[cl][i]))) use.push(i);
      let names = [...xs.map(t => t.name), "_cons"]; let X = use.map(i => [...xs.map(t => t.v[i]), 1]); const keep = stKeepCols(X); if (keep.length < names.length) { X = X.map(r => keep.map(j => r[j])); names = keep.map(j => names[j]); }
      const yv = use.map(i => +(y.v[i] !== 0)); const N = yv.length; const k = names.length; if (N <= k) throw new Error("Not enough rows for this model.");
      const ybar = yv.reduce((a, b) => a + b, 0) / N; if (ybar === 0 || ybar === 1) throw new Error(`${y.name} does not vary (all ${ybar ? "1" : "0"}); a ${cmd} model needs both 0s and 1s.`);
      const cdf = cmd === "logit" ? (z) => 1 / (1 + Math.exp(-z)) : meNormCdf; const pdf = cmd === "logit" ? (z) => { const p = 1 / (1 + Math.exp(-z)); return p * (1 - p); } : (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
      let b = new Array(k).fill(0); b[k - 1] = cmd === "logit" ? Math.log(ybar / (1 - ybar)) : meInvNorm(ybar); let info = null, ll = -Infinity, it = 0;
      const LL = (bb) => { let s = 0; for (let i = 0; i < N; i++) { const p = Math.min(1 - 1e-15, Math.max(1e-15, cdf(meDot(X[i], bb)))); s += yv[i] ? Math.log(p) : Math.log(1 - p); } return s; };
      for (it = 0; it < 100; it++) { const g = new Array(k).fill(0); const I = meZeros(k, k);
        for (let i = 0; i < N; i++) { const z = meDot(X[i], b); const p = Math.min(1 - 1e-12, Math.max(1e-12, cdf(z))); const f = pdf(z); const w = f * f / (p * (1 - p)); const s = (yv[i] - p) * f / (p * (1 - p)); for (let a = 0; a < k; a++) { g[a] += s * X[i][a]; for (let c = a; c < k; c++) I[a][c] += w * X[i][a] * X[i][c]; } }
        for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) I[a][c] = I[c][a]; info = stInv(I); if (!info) throw new Error("The model could not be estimated (perfect prediction or collinearity)."); const step = meMV(info, g);
        let t = 1, nb; const ll0 = LL(b); do { nb = b.map((v, j) => v + t * step[j]); t /= 2; } while (LL(nb) < ll0 - 1e-10 && t > 1e-6); b = nb; ll = LL(b); if (Math.max(...step.map(Math.abs)) < 1e-9) break; }
      if (cmd === "probit") { const Ho = meZeros(k, k); for (let i = 0; i < N; i++) { const xb = meDot(X[i], b); const q = 2 * yv[i] - 1; const lam = q * pdf(q * xb) / Math.max(1e-300, meNormCdf(q * xb)); const w = lam * (lam + xb); for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) Ho[a][c] += w * X[i][a] * X[i][c]; } const inv2 = stInv(Ho); if (inv2) info = inv2; }
      let V = info; if (rob || cl) { const meat = meZeros(k, k); const add2 = (s) => { for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) meat[a][c] += s[a] * s[c]; };
        const sc = (i) => { const z = meDot(X[i], b); const p = Math.min(1 - 1e-12, Math.max(1e-12, cdf(z))); const s = (yv[i] - p) * pdf(z) / (p * (1 - p)); return X[i].map(x => x * s); };
        let adj = N / (N - 1); if (cl) { const G = new Map(); use.forEach((ri, i) => { const key = fxKey(S.cols[cl][ri]); const s = sc(i); const a = G.get(key); if (a) s.forEach((v, j) => a[j] += v); else G.set(key, s); }); G.forEach(add2); adj = G.size / (G.size - 1); S.est.lastG = G.size; } else for (let i = 0; i < N; i++) add2(sc(i));
        V = meMatMul(meMatMul(info, meat), info).map(r => r.map(v => v * adj)); }
      const se = V.map((r, j) => Math.sqrt(Math.max(0, r[j]))); const ll0 = N * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar)); const lr = 2 * (ll - ll0);
      kv([["Number of obs", N.toLocaleString()], [`LR chi2(${k - 1})`, stFmt(lr, 5)], ["Prob > chi2", stP(meChi2Pval(lr, k - 1))], ["Pseudo R2", (1 - ll / ll0).toFixed(4)], ["Log likelihood", stFmt(ll, 7)], ["Iterations", it + 1]]);
      if (O.or && cmd === "logit") add({ type: "table", caption: `${y.name} (odds ratios)`, head: ["", "Odds ratio", "Std. err.", "z", "P>|z|", "[95% conf.", "interval]"], num: true, rows: names.map((nm, j) => { const z = b[j] / se[j]; const p = 2 * (1 - meNormCdf(Math.abs(z))); return [nm, stFmt(Math.exp(b[j]), 7) + stStars(p), stFmt(Math.exp(b[j]) * se[j], 7), stFmt(z, 4), stP(p), stFmt(Math.exp(b[j] - 1.96 * se[j]), 7), stFmt(Math.exp(b[j] + 1.96 * se[j]), 7)]; }) });
      else add({ ...coefTable(names, b, se, Infinity, true), caption: y.name });
      add({ type: "note", text: `${seLabel(cl, rob)}. Outcome: rows with ${y.name} ≠ 0 count as 1.` });
      store({ cmd, title: `${cmd === "logit" ? "Logit" : "Probit"} of ${y.name}`, depvar: y.name, yvec: y.v, names, b, se, V, df: Infinity, N, r2: 1 - ll / ll0, isZ: true, vecs: names.map(nm => nm === "_cons" ? null : (xs.find(t => t.name === nm) || {}).v), n0: n, link: cmd, cdf, pdf, use, ll, yv0: y.name });
      break; }

    case "ivreg": { const pm = stIvSplit(P.main); if (!pm) throw new Error("Write the endogenous part in brackets: to_ivreg y x1 (x2 = z1 z2)");
      const lhs = terms(pm[1] + " " + pm[4]); const y = lhs[0], exo = lhs.slice(1), endo = terms(pm[2]), ins = terms(pm[3]); if (!y) throw new Error("Put the outcome first."); if (ins.length < endo.length) throw new Error("Need at least as many instruments as endogenous variables.");
      const m = sample(); const cl = clusterOf(); const rob = !!(O.robust || O.r || O.vce === "robust"); const all = [y, ...exo, ...endo, ...ins];
      const use = []; for (let i = 0; i < n; i++) if (m[i] && all.every(t => isFinite(t.v[i])) && (!cl || !FXB(S.cols[cl][i]))) use.push(i);
      const Z = use.map(i => [...exo.map(t => t.v[i]), ...ins.map(t => t.v[i]), 1]); const fitted = [], fs = [];
      endo.forEach(t => { const yy = use.map(i => t.v[i]); const r1 = meOLS(Z, yy, { cluster: cl ? use.map(i => fxKey(S.cols[cl][i])) : null }); const V1 = (rob || cl) ? r1.V : r1.XtXinv.map(row => row.map(v => v * r1.sigma2));
        const idx = ins.map((_, j) => exo.length + j); const W = meWald(r1.beta, V1, idx, r1.df); fs.push({ name: t.name, F: W.F, p: W.pF, b: r1.beta, se: V1.map((row, j) => Math.sqrt(row[j])) }); fitted.push(Z.map(z => meDot(z, r1.beta))); });
      const names = [...endo.map(t => t.name), ...exo.map(t => t.name), "_cons"]; const Xh = use.map((_, q) => [...fitted.map(f => f[q]), ...exo.map(t => t.v[use[q]]), 1]); const Xa = use.map(i => [...endo.map(t => t.v[i]), ...exo.map(t => t.v[i]), 1]); const yv = use.map(i => y.v[i]);
      const r2s = meOLS(Xh, yv, { cluster: cl ? use.map(i => fxKey(S.cols[cl][i])) : null }); const e = yv.map((v, i) => v - meDot(Xa[i], r2s.beta)); const N = yv.length, k = names.length; const ssr = e.reduce((a, b) => a + b * b, 0);
      let V; if (rob || cl) { const inv = r2s.XtXinv; const meat = meZeros(k, k); if (cl) { const G = new Map(); use.forEach((ri, i) => { const key = fxKey(S.cols[cl][ri]); let s = G.get(key); if (!s) G.set(key, s = new Array(k).fill(0)); Xh[i].forEach((x, j) => s[j] += x * e[i]); }); G.forEach(s => { for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) meat[a][c] += s[a] * s[c]; }); S.est.lastG = G.size; const adj = G.size / (G.size - 1) * (N - 1) / (N - k); V = meMatMul(meMatMul(inv, meat), inv).map(r => r.map(v => v * adj)); }
        else { for (let i = 0; i < N; i++) for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) meat[a][c] += Xh[i][a] * Xh[i][c] * e[i] * e[i]; V = meMatMul(meMatMul(inv, meat), inv).map(r => r.map(v => v * N / (N - k))); } }
      else V = r2s.XtXinv.map(row => row.map(v => v * ssr / (N - k)));
      const se = V.map((r, j) => Math.sqrt(Math.max(0, r[j]))); const ybar = yv.reduce((a, b) => a + b, 0) / N; const r2 = 1 - ssr / yv.reduce((a, b) => a + (b - ybar) ** 2, 0);
      kv([["Number of obs", N.toLocaleString()], ["R-squared", r2.toFixed(4)], ["Root MSE", stFmt(Math.sqrt(ssr / N), 5)], ["Instrumented", endo.map(t => t.name).join(" ")], ["Instruments", [...exo, ...ins].map(t => t.name).join(" ")]]);
      add({ ...coefTable(names, r2s.beta, se, Infinity, true), caption: y.name });
      add({ type: "table", caption: "First stage", head: ["Endogenous", "F (excluded instruments)", "Prob > F", "Rule of thumb"], num: true, rows: fs.map(f => [f.name, stFmt(f.F, 5), stP(f.p), f.F >= 10 ? "F ≥ 10: instruments look strong" : "F < 10: weak instruments, be careful"]) });
      add({ type: "note", text: `${seLabel(cl, rob)}. Standard errors use z (large-sample), the usual default for 2SLS.` });
      store({ cmd, title: `2SLS of ${y.name}`, depvar: y.name, yvec: y.v, names, b: r2s.beta, se, V, df: Infinity, N, r2, isZ: true, vecs: names.map(nm => nm === "_cons" ? null : ([...endo, ...exo].find(t => t.name === nm) || {}).v), n0: n, link: "id" });
      break; }

    case "ttest": { const m = sample(); const unequal = !!(O.unequal || O.welch); const stats = (x) => { const N = x.length; const mu = x.reduce((a, b) => a + b, 0) / N; const sd = Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1)); return { N, mu, sd, se: sd / Math.sqrt(N) }; };
      const row = (nm, s) => { const c = meTQuant(0.975, s.N - 1); return [nm, s.N, stFmt(s.mu), stFmt(s.se), stFmt(s.sd), stFmt(s.mu - c * s.se), stFmt(s.mu + c * s.se)]; }; const head = ["Group", "Obs", "Mean", "Std. err.", "Std. dev.", "[95% conf.", "interval]"];
      const tail = (t, df, lab) => { add({ type: "kv", items: [[lab, ""], ["t", stFmt(t, 4)], ["degrees of freedom", stFmt(df, 5)], ["Pr(T < t)", stP(1 - (t > 0 ? meTPval(t, df) / 2 : 1 - meTPval(t, df) / 2))], ["Pr(|T| > |t|)", stP(meTPval(t, df))], ["Pr(T > t)", stP(t > 0 ? meTPval(t, df) / 2 : 1 - meTPval(t, df) / 2)]] }); out.msg = `t = ${stFmt(t, 4)}, p = ${stP(meTPval(t, df))}`; };
      const eq = P.main.match(/^(.+?)==(.+)$/);
      if (O.by && !eq) { const v = vars(P.main, { need: 1, max: 1 })[0]; const g = vars(O.by, { max: 1 })[0]; const lv = [...new Set(S.cols[g].filter((x, i) => m[i] && !FXB(x)).map(fxKey))]; if (lv.length !== 2) throw new Error(`by(${g}) must have exactly two groups; it has ${lv.length}.`);
        lv.sort(); const xs = lv.map(l => numv(v).filter((x, i) => m[i] && isFinite(x) && fxKey(S.cols[g][i]) === l)); const a = stats(xs[0]), b = stats(xs[1]); const d = a.mu - b.mu;
        let se, df; if (unequal) { se = Math.sqrt(a.se ** 2 + b.se ** 2); df = (a.se ** 2 + b.se ** 2) ** 2 / (a.se ** 4 / (a.N - 1) + b.se ** 4 / (b.N - 1)); } else { const sp = ((a.N - 1) * a.sd ** 2 + (b.N - 1) * b.sd ** 2) / (a.N + b.N - 2); se = Math.sqrt(sp * (1 / a.N + 1 / b.N)); df = a.N + b.N - 2; }
        add({ type: "table", head, num: true, rows: [row(lv[0], a), row(lv[1], b), ["diff", "", stFmt(d), stFmt(se), "", stFmt(d - meTQuant(0.975, df) * se), stFmt(d + meTQuant(0.975, df) * se)]] }); tail(d / se, df, `diff = mean(${lv[0]}) − mean(${lv[1]})${unequal ? " · unequal variances (Welch)" : ""}`); break; }
      if (!eq) throw new Error(`Syntax: ${ST_CMDS.ttest.syn}`); const v = vars(eq[1], { max: 1 })[0]; const rhs = eq[2].trim(); const other = S.findCol(stUnq(rhs));
      if (other) { const x = numv(v), y = numv(other); const dd = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(x[i]) && isFinite(y[i])) dd.push(x[i] - y[i]); const s = stats(dd);
        add({ type: "table", head, num: true, rows: [row(`diff (${v} − ${other})`, s)] }); tail(s.mu / s.se, s.N - 1, "Paired t test, H0: mean(diff) = 0"); break; }
      const mu0 = fxNum(S.evalExpr(rhs)[0]); if (!isFinite(mu0)) throw new Error(`"${rhs}" is not a number or a column.`); const s = stats(numv(v).filter((x, i) => m[i] && isFinite(x)));
      add({ type: "table", head, num: true, rows: [row(v, s)] }); tail((s.mu - mu0) / s.se, s.N - 1, `H0: mean(${v}) = ${stFmt(mu0)}`); break; }

    case "anova": { const [yv, g] = vars(P.main, { need: 2, max: 2 }); const m = sample(); const y = numv(yv); const gm = new Map(); for (let i = 0; i < n; i++) { if (!m[i] || !isFinite(y[i]) || FXB(S.cols[g][i])) continue; const k = fxS(S.cols[g][i]); const a = gm.get(k) || []; a.push(y[i]); gm.set(k, a); }
      const all = [...gm.values()].flat(); const N = all.length, K = gm.size; const mu = all.reduce((a, b) => a + b, 0) / N; let ssb = 0, ssw = 0; gm.forEach(a => { const mm = a.reduce((p, q) => p + q, 0) / a.length; ssb += a.length * (mm - mu) ** 2; a.forEach(v => ssw += (v - mm) ** 2); });
      const F = (ssb / (K - 1)) / (ssw / (N - K)); add({ type: "table", head: ["Source", "SS", "df", "MS", "F", "Prob > F"], num: true, rows: [["Between groups", stFmt(ssb), K - 1, stFmt(ssb / (K - 1)), stFmt(F, 5), stP(meFPval(F, K - 1, N - K))], ["Within groups", stFmt(ssw), N - K, stFmt(ssw / (N - K)), "", ""], ["Total", stFmt(ssb + ssw), N - 1, stFmt((ssb + ssw) / (N - 1)), "", ""]] });
      add({ type: "table", caption: "Group means", head: [g, "Obs", "Mean", "Std. dev."], num: true, rows: [...gm.entries()].map(([k, a]) => { const mm = a.reduce((p, q) => p + q, 0) / a.length; return [k, a.length, stFmt(mm), stFmt(Math.sqrt(a.reduce((p, q) => p + (q - mm) ** 2, 0) / (a.length - 1)))]; }) });
      out.msg = `F(${K - 1}, ${N - K}) = ${stFmt(F, 4)}, p = ${stP(meFPval(F, K - 1, N - K))}`; break; }

    case "predict": { const e = S.est.last; if (!e) throw new Error("Run a model first (to_reg, to_logit, ...), then to_predict."); if (!e.vecs) throw new Error("to_predict needs a model run directly (not to_bootstrap). Run the model again, then to_predict."); if (e.fe && e.fe.length) throw new Error("to_predict after fixed-effects models is not available yet; use to_reg with i.unit dummies instead.");
      if (e.n0 !== n) throw new Error("Rows changed since the model ran. Put to_predict right after the model."); const nm = stUnq(P.main.split(/\s+/)[0]); if (!nm) throw new Error("Name the new column: to_predict yhat");
      const xb = Array.from({ length: n }, (_, i) => { let s = 0; for (let j = 0; j < e.names.length; j++) { const v = e.vecs[j]; const x = v ? v[i] : 1; if (!isFinite(x)) return NaN; s += e.b[j] * x; } return s; });
      let v = xb; if (O.resid || O.residuals || O.r) { const yc = S.findCol(e.depvar); const yy = e.yvec && e.yvec.length === n ? e.yvec : yc ? numv(yc) : null; if (!yy) throw new Error(`Cannot find the outcome ${e.depvar}; run the model again right before to_predict.`); v = xb.map((x, i) => yy[i] - x); } else if ((O.pr || (!O.xb && e.link !== "id")) && e.cdf) v = xb.map(x => isFinite(x) ? e.cdf(x) : NaN);
      S.setCol(nm, v); out.msg = `${nm}: ${O.resid || O.residuals || O.r ? "residuals" : (O.pr || (!O.xb && e.link !== "id")) ? "predicted probabilities" : "fitted values"} from ${e.name}`; out.changes = true; break; }

    case "test": { const e = S.est.last; if (!e) throw new Error("Run a model first, then to_test."); const R = []; const r = [];
      const parts = P.main.includes("=") ? P.main.split(/\)\s*\(|;/).map(x => x.replace(/^\(|\)$/g, "")) : [P.main];
      const idx = (nm) => { const j = e.names.findIndex(x => x.toLowerCase() === stUnq(nm).toLowerCase()); if (j < 0) throw new Error(`${stUnq(nm)} is not in the last model (${e.names.join(", ")}).`); return j; };
      parts.forEach(pt => { const sides = pt.split("=").map(x => x.trim()).filter(Boolean); if (sides.length === 1) stTokens(sides[0]).forEach(t => { const row = new Array(e.names.length).fill(0); row[idx(t)] = 1; R.push(row); r.push(0); });
        else for (let s = 1; s < sides.length; s++) { const row = new Array(e.names.length).fill(0); row[idx(sides[0])] += 1; const num = fxNum(sides[s]); if (isFinite(num)) r.push(num); else { row[idx(sides[s])] -= 1; r.push(0); } R.push(row); } });
      const Rb = R.map((row, i) => meDot(row, e.b) - r[i]); const RVR = R.map(a => R.map(b => meDot(a, meMV(e.V, b)))); const inv = stInv(RVR); if (!inv) throw new Error("These restrictions are not independent.");
      const W = meQF(Rb, inv), q = R.length; const F = W / q; const p = isFinite(e.df) ? meFPval(F, q, e.df) : meChi2Pval(W, q);
      add({ type: "kv", items: [["Restrictions", P.main], [isFinite(e.df) ? `F(${q}, ${e.df})` : `chi2(${q})`, stFmt(isFinite(e.df) ? F : W, 5)], [isFinite(e.df) ? "Prob > F" : "Prob > chi2", stP(p)]] }); out.msg = `p = ${stP(p)}`; break; }

    case "esttab": { const want = stTokens(P.main).map(stUnq); const Ms = want.length ? want.map(w => { const x = S.est.models.find(mm => mm.name === w); if (!x) throw new Error(`No model called ${w}. Models so far: ${S.est.models.map(mm => mm.name).join(", ") || "none"}.`); return x; }) : S.est.models;
      if (!Ms.length) throw new Error("No models yet. Run to_reg (or another model) first."); const vn = [...new Set(Ms.flatMap(mm => mm.names.filter(x => x !== "_cons"))), ...(Ms.some(mm => mm.names.includes("_cons")) ? ["_cons"] : [])];
      const rows = []; vn.forEach(v => { const r1 = [v], r2 = [""]; Ms.forEach(mm => { const j = mm.names.indexOf(v); if (j < 0) { r1.push(""); r2.push(""); return; } const t = mm.b[j] / mm.se[j]; const p = mm.isZ ? 2 * (1 - meNormCdf(Math.abs(t))) : meTPval(t, mm.df); r1.push(stFmt(mm.b[j], 5) + stStars(p)); r2.push(`(${O.t ? stFmt(t, 3) : O.p ? stP(p) : stFmt(mm.se[j], 4)})`); }); rows.push(r1, r2); });
      rows.push(["N", ...Ms.map(mm => mm.N.toLocaleString())], [Ms.some(mm => mm.isZ) ? "R² / pseudo R²" : "R²", ...Ms.map(mm => mm.r2 != null && isFinite(mm.r2) ? mm.r2.toFixed(3) : "")]);
      const tb = { type: "table", head: ["", ...Ms.map(mm => `${mm.name}\n${mm.depvar}`)], rows: O.keep && O.keep !== true ? (() => { const kp = stTokens(O.keep).map(stUnq); const out3 = []; for (let q = 0; q < rows.length; q += 2) { if (!/^(N|R²)/.test(rows[q][0]) && !kp.includes(rows[q][0])) continue; out3.push(rows[q]); if (rows[q + 1] && rows[q + 1][0] === "") out3.push(rows[q + 1]); } return out3.concat(rows.filter(r => /^(N|R²)/.test(r[0]))).filter((r, q, A) => A.indexOf(r) === q); })() : O.drop && O.drop !== true ? (() => { const dp = stTokens(O.drop).map(stUnq); const out3 = []; for (let q = 0; q < rows.length; q++) { if (dp.some(d => d.endsWith("*") ? String(rows[q][0]).startsWith(d.slice(0, -1)) : rows[q][0] === d)) { if (rows[q + 1] && rows[q + 1][0] === "") q++; continue; } out3.push(rows[q]); } return out3; })() : rows, num: true, note: `${O.t ? "t statistics" : O.p ? "p-values" : "Standard errors"} in parentheses. * p<0.10, ** p<0.05, *** p<0.01` };
      add(tb); if (O.latex || O.tex) add({ type: "text", text: stTexTable(tb, { caption: O.title && O.title !== true ? stUnq(O.title) : "", label: "tab:esttab" }), latex: true }); out.msg = `${Ms.length} model${Ms.length > 1 ? "s" : ""} side by side`; break; }

    case "coefplot": { const e = S.est.last; if (!e) throw new Error("Run a model first, then to_coefplot."); const dropC = !O.keepcons; const crit = e.isZ || !isFinite(e.df) ? 1.96 : meTQuant(0.975, e.df);
      const rows = e.names.map((nm, j) => [nm, e.b[j] - crit * e.se[j], e.b[j] + crit * e.se[j], e.b[j]]).filter(r => !(dropC && r[0] === "_cons"));
      add({ type: "chart", title: `Coefficients of ${e.name} (95% intervals)`, tab: { headers: ["variable", "lower 95%", "upper 95%", "coefficient"], rows }, t: { type: "dumbbell", x: "variable", ys: ["lower 95%", "upper 95%"], agg: "mean", opts: {} } });
      add({ type: "table", head: ["", "Coefficient", "Lower 95%", "Upper 95%"], num: true, rows: rows.map(r => [r[0], stFmt(r[3]), stFmt(r[1]), stFmt(r[2])]) }); out.msg = `${rows.length} coefficients`; break; }

    case "display": { const e = S.est.last; let ex = P.main + (P.cond ? " if " + P.cond : "");
      ex = ex.replace(/_b\[([^\]]+)\]/g, (_, v) => { if (!e) throw new Error("_b[] needs a model first."); const j = e.names.indexOf(v.trim()); if (j < 0) throw new Error(`${v} is not in the last model.`); return `(${e.b[j]})`; })
        .replace(/_se\[([^\]]+)\]/g, (_, v) => { if (!e) throw new Error("_se[] needs a model first."); const j = e.names.indexOf(v.trim()); if (j < 0) throw new Error(`${v} is not in the last model.`); return `(${e.se[j]})`; })
        .replace(/e\((N|r2|r2_a|F|rmse)\)/g, (_, k) => { if (!e) throw new Error(`e(${k}) needs a model first.`); return `(${{ N: e.N, r2: e.r2, r2_a: e.ar2, F: e.F, rmse: e.rmse }[k]})`; })
        .replace(/r\((N|count)\)/g, (all, k) => `(${S.est.r && S.est.r[k] != null ? S.est.r[k] : S.est.scalars.count ?? NaN})`);
      const lit = ex.match(/^\s*"(.*)"\s*$/); if (lit) { add({ type: "text", text: lit[1] }); out.msg = lit[1]; break; }
      const v = S.evalExpr(ex); const first = v.find(x => !FXB(x)); add({ type: "text", text: `  ${typeof first === "number" ? stFmt(first, 10) : fxS(first)}` }); out.msg = `= ${typeof first === "number" ? stFmt(first, 10) : fxS(first)}`; break; }

    // ── change data ──
    case "gen": case "replace": { const eq = P.main.match(/^([^=]+?)\s*=(?!=)\s*(.+)$/s); if (!eq) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); let nm = stUnq(eq[1].replace(/^(byte|int|long|float|double|str\d*)\s+/i, ""));
      const exists = S.findCol(nm); if (cmd === "gen" && exists) throw new Error(`${exists} already exists. Use to_replace to change it, or pick a new name.`); if (cmd === "replace" && !exists) throw new Error(`No column called ${nm}. Use to_gen to make it.`); if (exists) nm = exists;
      const v = S.evalExpr(eq[2]); const m = sample(); const old = exists ? S.cols[exists] : null; let ch = 0; const nv = v.map((x, i) => { if (m[i]) { ch++; return x; } return old ? old[i] : null; }); S.setCol(nm, nv);
      out.msg = `${nm} ${cmd === "gen" ? "created" : "replaced"} · ${ch.toLocaleString()} row${ch === 1 ? "" : "s"}${P.cond ? " meeting the condition" : ""}`; out.changes = true; break; }

    case "egen": { const eq = P.main.match(/^([^=]+?)\s*=\s*([a-z_]+)\s*\((.*)\)\s*$/is); if (!eq) throw new Error(`Syntax: ${ST_CMDS.egen.syn}`); const nm = stUnq(eq[1]); const fn = eq[2].toLowerCase(); const inner = eq[3]; const m = sample();
      const by = O.by ? vars(O.by) : []; const keys = groupKeys(by); const ROW = { rowmean: "mean", rowtotal: "sum", rowmax: "max", rowmin: "min", rowsd: "sd", rownonmiss: "count", rowmiss: "miss" };
      let v;
      if (ROW[fn]) { const vs = vars(inner); const X = vs.map(numv); v = Array.from({ length: n }, (_, i) => { if (!m[i]) return null; const xs = X.map(c => c[i]).filter(isFinite); const how = ROW[fn]; if (how === "miss") return vs.length - xs.length; if (how === "count") return xs.length; if (!xs.length) return how === "sum" ? 0 : NaN;
        const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return how === "mean" ? mu : how === "sum" ? xs.reduce((a, b) => a + b, 0) : how === "max" ? Math.max(...xs) : how === "min" ? Math.min(...xs) : xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)) : NaN; }); }
      else if (fn === "group") { const vs = vars(inner); const k2 = Array.from({ length: n }, (_, i) => vs.some(h => FXB(S.cols[h][i])) ? null : vs.map(h => fxKey(S.cols[h][i])).join("\u0001")); const lv = [...new Set(k2.filter((x, i) => x != null && m[i]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); const pos = new Map(lv.map((x, i) => [x, i + 1])); v = k2.map((x, i) => x != null && m[i] ? pos.get(x) : null); }
      else if (fn === "tag") { const vs = vars(inner); const seen = new Set(); v = Array.from({ length: n }, (_, i) => { if (!m[i]) return 0; const k = vs.map(h => fxKey(S.cols[h][i])).join("\u0001"); if (seen.has(k)) return 0; seen.add(k); return 1; }); }
      else { const pm = inner.match(/^(.*?)(?:,\s*p\(\s*([\d.]+)\s*\))?$/); const expr = pm[1]; const x = S.evalExpr(expr).map(fxNum); const gm = new Map(); for (let i = 0; i < n; i++) { if (!m[i]) continue; const a = gm.get(keys[i]); if (a) a.push(i); else gm.set(keys[i], [i]); }
        v = new Array(n).fill(null); const p = pm[2] ? +pm[2] / 100 : 0.5;
        gm.forEach(ix => { const vals = ix.map(i => x[i]).filter(isFinite); const N = vals.length; const mu = N ? vals.reduce((a, b) => a + b, 0) / N : NaN; const sd = N > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1)) : NaN; const srt = vals.slice().sort((a, b) => a - b); const q = (f) => { if (!N) return NaN; const hh = (N - 1) * f, lo = Math.floor(hh); return srt[lo] + (srt[Math.min(lo + 1, N - 1)] - srt[lo]) * (hh - lo); };
          const F = { mean: mu, avg: mu, total: vals.reduce((a, b) => a + b, 0), sum: vals.reduce((a, b) => a + b, 0), count: N, sd, min: N ? srt[0] : NaN, max: N ? srt[N - 1] : NaN, median: q(0.5), pctile: q(p), iqr: q(0.75) - q(0.25) };
          if (fn === "rank") { const rk = new Map(); srt.forEach((val, k) => { const a = rk.get(val); if (a) a.push(k + 1); else rk.set(val, [k + 1]); }); ix.forEach(i => { const a = rk.get(x[i]); v[i] = a ? a.reduce((s, t) => s + t, 0) / a.length : NaN; }); }
          else if (fn === "std") ix.forEach(i => v[i] = (x[i] - mu) / sd);
          else if (fn in F) ix.forEach(i => v[i] = F[fn]);
          else throw new Error(`to_egen has no function ${fn}(). Available: mean, total, count, sd, min, max, median, pctile, iqr, rank, std, group, tag, rowmean, rowtotal, rowmax, rowmin, rowsd, rowmiss, rownonmiss.`); }); }
      S.setCol(nm, v); out.msg = `${nm} = ${fn}(${inner})${by.length ? ` by ${by.join(", ")}` : ""}`; out.changes = true; break; }

    case "drop": case "keep": { if (P.cond || P.range) { if (P.main) throw new Error("Use either a list of columns or  if condition, not both."); const m = sample(); const before = n; S.filterRows(i => cmd === "keep" ? !!m[i] : !m[i]); out.msg = `${cmd === "drop" ? "dropped" : "kept"} ${(cmd === "drop" ? before - S.n : S.n).toLocaleString()} rows · ${S.n.toLocaleString()} left`; out.changes = true; break; }
      const vs = vars(P.main, { need: 1 }); const gone = cmd === "drop" ? vs : H().filter(h => !vs.includes(h)); if (gone.length >= H().length) throw new Error("That would remove every column.");
      S.dropCols(gone); if (cmd === "keep") S.order(vs); out.msg = `${cmd === "drop" ? "dropped" : "kept"} ${cmd === "drop" ? gone.length : vs.length} column${(cmd === "drop" ? gone.length : vs.length) === 1 ? "" : "s"}`; out.changes = true; break; }

    case "rename": { const tk = stTokens(P.main).map(stUnq); if (tk.length !== 2) throw new Error("Syntax: to_rename old new"); const h = col(tk[0]); if (S.findCol(tk[1]) && S.findCol(tk[1]) !== h) throw new Error(`${tk[1]} already exists.`); S.renameCol(h, tk[1]); out.msg = `${h} → ${tk[1]}`; out.changes = true; break; }

    case "sort": case "gsort": { const spec = stTokens(P.main).map(t => { const desc = cmd === "gsort" && t.startsWith("-"); const h = col(t.replace(/^[-+]/, "")); return { h, desc, x: S.cols[h] }; }); if (!spec.length) throw new Error("Say which columns to sort by.");
      const cmp = (a, b) => { for (const s of spec) { const x = s.x[a], y = s.x[b]; const bx = FXB(x), by2 = FXB(y); let c; if (bx || by2) c = bx && by2 ? 0 : bx ? 1 : -1; else { const p = fxNum(x), q = fxNum(y); c = isFinite(p) && isFinite(q) ? p - q : fxS(x).localeCompare(fxS(y), undefined, { numeric: true }); if (s.desc) c = -c; } if (c) return c; } return a - b; };
      const idx = Array.from({ length: n }, (_, i) => i).sort(cmp); S.reorderRows(idx); out.msg = `sorted by ${spec.map(s => (s.desc ? "-" : "") + s.h).join(" ")}`; out.changes = true; break; }

    case "duplicates": { const [mode, ...rest2] = stTokens(P.main); const vs = rest2.length ? vars(rest2.join(" ")) : H(); const seen = new Map(); const dup = new Uint8Array(n); let k = 0;
      for (let i = 0; i < n; i++) { const key = vs.map(h => fxKey(S.cols[h][i])).join("\u0001"); if (seen.has(key)) { dup[i] = 1; k++; } else seen.set(key, i); }
      if ((mode || "").toLowerCase() === "drop") { S.filterRows(i => !dup[i]); out.msg = `dropped ${k.toLocaleString()} repeated row${k === 1 ? "" : "s"}`; out.changes = true; break; }
      if ((mode || "").toLowerCase() !== "report") throw new Error("Syntax: to_duplicates report [vars]  or  to_duplicates drop [vars]");
      add({ type: "kv", items: [["Rows", n.toLocaleString()], ["Distinct", seen.size.toLocaleString()], ["Surplus (repeated) rows", k.toLocaleString()]] }); out.msg = `${k.toLocaleString()} repeated rows`; break; }

    case "destring": { const vs = vars(P.main, { need: 1 }); let bad = 0; vs.forEach(h => { const nv = S.cols[h].map(v => { if (FXB(v)) return null; if (typeof v === "number") return v; const s = String(v).replace(/[,\s$€£¥₵%]/g, "").replace(/^\((.*)\)$/, "-$1"); const x = s === "" ? NaN : +s; if (!isFinite(x)) { bad++; return O.force ? null : v; } return /%\s*$/.test(String(v)) && O.percent ? x / 100 : x; }); S.setCol(h, nv); });
      out.msg = `converted ${vs.length} column${vs.length > 1 ? "s" : ""} to numbers${bad ? ` · ${bad.toLocaleString()} values were not numbers and were ${O.force ? "blanked (force)" : "left as text"}` : ""}`; out.changes = true; break; }

    case "encode": { const h = vars(P.main, { need: 1, max: 1 })[0]; const nm = O.gen && O.gen !== true ? stUnq(O.gen) : O.generate && O.generate !== true ? stUnq(O.generate) : null; if (!nm) throw new Error("Name the new column: to_encode region, gen(region_id)");
      const lv = [...new Set(S.cols[h].filter(v => !FXB(v)).map(fxS))].sort((a, b) => a.localeCompare(b)); const pos = new Map(lv.map((x, i) => [x, i + 1])); S.setCol(nm, S.cols[h].map(v => FXB(v) ? null : pos.get(fxS(v)))); S.est.labels = S.est.labels || {}; S.est.labels[nm] = lv;
      add({ type: "table", caption: `${nm} codes`, head: ["Code", h], rows: lv.slice(0, 200).map((x, i) => [i + 1, x]), note: lv.length > 200 ? `${lv.length} codes; first 200 shown.` : null }); out.msg = `${nm}: ${lv.length} codes`; out.changes = true; break; }

    case "xtile": { const eq = P.main.match(/^([^=]+?)\s*=\s*(.+)$/); if (!eq) throw new Error(`Syntax: ${ST_CMDS.xtile.syn}`); const nm = stUnq(eq[1]); const x = S.evalExpr(eq[2]).map(fxNum); const k = Math.max(2, Math.round(+O.n || +O.nq || 4)); const m = sample();
      const by = O.by ? vars(O.by) : []; const keys = groupKeys(by); const gm = new Map(); for (let i = 0; i < n; i++) if (m[i] && isFinite(x[i])) { const a = gm.get(keys[i]); if (a) a.push(i); else gm.set(keys[i], [i]); }
      const v = new Array(n).fill(null); gm.forEach(ix => { const s = ix.map(i => x[i]).sort((a, b) => a - b); const cut = Array.from({ length: k - 1 }, (_, q) => { const hh = (s.length - 1) * (q + 1) / k, lo = Math.floor(hh); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (hh - lo); }); ix.forEach(i => { let g = 1; while (g < k && x[i] > cut[g - 1]) g++; v[i] = g; }); });
      S.setCol(nm, v); out.msg = `${nm}: ${k} groups of ${eq[2].trim()}`; out.changes = true; break; }

    case "winsor": { const vs = vars(P.main, { need: 1 }); const p = O.p ? +O.p : O.cuts ? +String(O.cuts).split(/\s+/)[0] / 100 : 0.01; if (!(p > 0 && p < 0.5)) throw new Error("p() must be between 0 and 0.5, for example p(0.01)."); const m = sample();
      vs.forEach(h => { const x = numv(h); const s = x.filter((v, i) => m[i] && isFinite(v)).sort((a, b) => a - b); const q = (f) => { const hh = (s.length - 1) * f, lo = Math.floor(hh); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (hh - lo); }; const lo = q(p), hi = q(1 - p);
        S.setCol(O.replace ? h : `${h}_w`, x.map((v, i) => !m[i] || !isFinite(v) ? (O.replace ? S.cols[h][i] : null) : Math.min(hi, Math.max(lo, v)))); });
      out.msg = `capped ${vs.join(", ")} at the ${(p * 100).toFixed(1)}th and ${((1 - p) * 100).toFixed(1)}th percentiles${O.replace ? "" : " (new _w columns)"}`; out.changes = true; break; }

    case "collapse": { const by = O.by ? vars(O.by) : []; const specs = []; let stat = "mean"; stTokens(P.main).forEach(t => { const sm = t.match(/^\((\w+)\)$/); if (sm) { stat = sm[1].toLowerCase(); return; } const as = t.match(/^(.+?)=(.+)$/); if (as) vars(as[2]).forEach(h => specs.push({ out: stUnq(as[1]), h, stat })); else vars(t).forEach(h => specs.push({ out: h, h, stat })); });
      if (!specs.length) throw new Error(`Syntax: ${ST_CMDS.collapse.syn}`); const m = sample(); const keys = groupKeys(by); const gm = new Map(); for (let i = 0; i < n; i++) if (m[i]) { const a = gm.get(keys[i]); if (a) a.push(i); else gm.set(keys[i], [i]); }
      const okS = ["mean", "sum", "count", "sd", "min", "max", "median", "first", "last", "p25", "p75", "iqr"]; specs.forEach(s => { if (!okS.includes(s.stat)) throw new Error(`Unknown statistic (${s.stat}). Use one of: ${okS.join(", ")}.`); });
      const outH = [...by, ...specs.map(s => s.out)]; const C2 = Object.fromEntries(outH.map(h => [h, []]));
      gm.forEach(ix => { by.forEach(h => C2[h].push(S.cols[h][ix[0]])); specs.forEach(s => { const raw = ix.map(i => S.cols[s.h][i]); const x = raw.map(fxNum).filter(isFinite); const N = x.length; const mu = N ? x.reduce((a, b) => a + b, 0) / N : NaN; const srt = x.slice().sort((a, b) => a - b); const q = (f) => { if (!N) return NaN; const hh = (N - 1) * f, lo = Math.floor(hh); return srt[lo] + (srt[Math.min(lo + 1, N - 1)] - srt[lo]) * (hh - lo); };
        C2[s.out].push({ mean: mu, sum: x.reduce((a, b) => a + b, 0), count: N, sd: N > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1)) : NaN, min: N ? srt[0] : NaN, max: N ? srt[N - 1] : NaN, median: q(0.5), p25: q(0.25), p75: q(0.75), iqr: q(0.75) - q(0.25), first: raw.find(v => !FXB(v)) ?? null, last: [...raw].reverse().find(v => !FXB(v)) ?? null }[s.stat]); }); });
      const before = n; S.replaceAll(outH, C2); out.msg = `collapsed ${before.toLocaleString()} rows to ${S.n.toLocaleString()}${by.length ? ` (one per ${by.join(" × ")})` : ""}`; out.changes = true; break; }

    case "reshape": { const [mode, ...stubs] = stTokens(P.main).map(stUnq); const i0 = O.i && O.i !== true ? vars(O.i) : null; const j0 = O.j && O.j !== true ? stUnq(O.j) : null; if (!stubs.length || !i0 || !j0) throw new Error(`Syntax: ${ST_CMDS.reshape.syn}`);
      if (mode.toLowerCase() === "long") { const sufs = new Set(); const stubCols = {}; stubs.forEach(st => { stubCols[st] = H().filter(h => h.toLowerCase().startsWith(st.toLowerCase()) && h.length > st.length && /^[_.]?[\w.-]+$/.test(h.slice(st.length))); if (!stubCols[st].length) throw new Error(`No columns start with ${st} (e.g. ${st}2010).`); stubCols[st].forEach(h => sufs.add(h.slice(st.length).replace(/^[_.]/, ""))); });
        const sl = [...sufs].sort((a, b) => { const x = +a, y = +b; return isFinite(x) && isFinite(y) ? x - y : a.localeCompare(b); }); const used = new Set(Object.values(stubCols).flat()); const others = H().filter(h => !used.has(h));
        const outH = [...others, j0, ...stubs]; const C2 = Object.fromEntries(outH.map(h => [h, []]));
        for (let r = 0; r < n; r++) sl.forEach(sf => { others.forEach(h => C2[h].push(S.cols[h][r])); C2[j0].push(isFinite(+sf) ? +sf : sf); stubs.forEach(st => { const h = stubCols[st].find(c => c.slice(st.length).replace(/^[_.]/, "") === sf); C2[st].push(h ? S.cols[h][r] : null); }); });
        const before = n; S.replaceAll(outH, C2); out.msg = `long: ${before.toLocaleString()} rows → ${S.n.toLocaleString()} (${sl.length} values of ${j0})`; out.changes = true; break; }
      if (mode.toLowerCase() === "wide") { const jh = col(j0); stubs.forEach(col); const keys = groupKeys(i0); const lv = [...new Set(S.cols[jh].filter(v => !FXB(v)).map(fxS))].sort((a, b) => { const x = +a, y = +b; return isFinite(x) && isFinite(y) ? x - y : a.localeCompare(b); });
        if (lv.length > 300) throw new Error(`${jh} has ${lv.length} values; wide format would need too many columns.`); const rowsOf = new Map(); for (let r = 0; r < n; r++) { const a = rowsOf.get(keys[r]); if (a) a.push(r); else rowsOf.set(keys[r], [r]); }
        const outH = [...i0, ...stubs.flatMap(st => lv.map(l => `${col(st)}${l}`))]; const C2 = Object.fromEntries(outH.map(h => [h, []]));
        rowsOf.forEach(rs => { i0.forEach(h => C2[h].push(S.cols[h][rs[0]])); stubs.forEach(st => { const hh = col(st); lv.forEach(l => { const r = rs.find(q => fxS(S.cols[jh][q]) === l); C2[`${hh}${l}`].push(r != null ? S.cols[hh][r] : null); }); }); });
        const before = n; S.replaceAll(outH, C2); out.msg = `wide: ${before.toLocaleString()} rows → ${S.n.toLocaleString()}, ${outH.length - i0.length} value columns`; out.changes = true; break; }
      throw new Error(`Syntax: ${ST_CMDS.reshape.syn}`); }

    case "xtset": case "tsset": { const vs = vars(P.main, { need: 1, max: 2 }); const u = cmd === "xtset" && vs.length === 2 ? vs[0] : cmd === "xtset" && vs.length === 1 ? vs[0] : null; const t = cmd === "tsset" ? vs[vs.length - 1] : vs[1] || null; S.setPanel(u, t);
      if (u && t) { const seen = new Set(); let dup = 0; for (let i = 0; i < n; i++) { const k = fxKey(S.cols[u][i]) + "\u0001" + fxKey(S.cols[t][i]); if (seen.has(k)) dup++; seen.add(k); } if (dup) add({ type: "note", text: `Warning: ${dup.toLocaleString()} rows repeat the same ${u} and ${t}. Lags (L.) use row order within each ${u}.` }); }
      kv([["Panel unit", u || "none"], ["Time", t || "row order"], ["Units", u ? new Set(S.cols[u].map(fxKey)).size.toLocaleString() : "1"]]); out.msg = `${u ? `unit ${u}, ` : ""}time ${t || "row order"}`; break; }

    // ── graphs ──
    case "scatter": { const vs = vars(P.main, { need: 2, max: 3 }); const g = O.over ? vars(O.over, { max: 1 })[0] : O.by && O.by !== true ? vars(O.by, { max: 1 })[0] : ""; const [y, x, x2] = vs; // 3 variables: y is the height, x and x2 the floor
      const t = { type: "scatter", x, ys: [y], group: g, opts: { trend: !O.nofit } }; const t3 = x2 ? { type: "scatter3d", x, ys: [x2], size: y, group: g, opts: {} } : null; chart(x2 ? `${y} by ${x} and ${x2}` : `${y} against ${x}`, [...new Set([x, y, x2, g].filter(Boolean))], x2 ? t3 : t, x2 ? t : null); break; }
    case "line": { const vs = vars(P.main, { need: 2 }); const x = vs[vs.length - 1], ys = vs.slice(0, -1); const g = O.over ? vars(O.over, { max: 1 })[0] : O.by && O.by !== true ? vars(O.by, { max: 1 })[0] : "";
      chart(`${ys.join(", ")} over ${x}`, [...new Set([x, ...ys, g].filter(Boolean))], { type: "line", x, ys: g ? [ys[0]] : ys, group: g, agg: O.stat || "mean", opts: { dots: true } }); break; }
    case "bar": case "hbar": case "pie": { const ys = P.main ? vars(P.main) : []; const over = O.over ? vars(O.over) : []; if (!over.length) throw new Error(`Say which groups: ${ST_CMDS[cmd].syn}`); const by = O.by && O.by !== true ? vars(O.by, { max: 1 })[0] : over[1] || "";
      chart(`${O.stat || (ys.length ? "mean" : "count")} of ${ys.join(", ") || "rows"} by ${over[0]}${by ? ` and ${by}` : ""}`, [...new Set([over[0], ...ys, by].filter(Boolean))], { type: cmd, x: over[0], ys: by && cmd !== "pie" ? ys.slice(0, 1) : ys, group: cmd === "pie" ? "" : by, agg: O.stat || (ys.length ? (cmd === "pie" ? "sum" : "mean") : "count"), opts: { labels: cmd === "pie", sort: cmd === "hbar" ? "desc" : undefined } }); break; }
    case "hist": case "kdensity": case "box": { const vs = vars(P.main, { need: 1 }); const g = O.over ? vars(O.over, { max: 1 })[0] : O.by && O.by !== true ? vars(O.by, { max: 1 })[0] : "";
      chart(`${cmd === "hist" ? "Histogram" : cmd === "box" ? "Box plot" : "Density"} of ${vs.join(", ")}${g ? ` by ${g}` : ""}`, [...new Set([...vs, g].filter(Boolean))], { type: cmd === "kdensity" ? "density" : cmd, ys: g ? vs.slice(0, 1) : vs, group: g, opts: { bins: O.bins ? +O.bins : undefined, density: !!O.density || !!O.percent } }); break; }
    case "heatmap": case "surface": { const y = vars(P.main, { need: 1, max: 1 })[0]; const over = O.over ? vars(O.over) : []; if (over.length !== 2) throw new Error(`Give two variables in over(): ${ST_CMDS[cmd].syn}`);
      const t2 = { type: "heatmap", x: over[0], group: over[1], ys: [y], agg: O.stat || "mean", opts: {} }, t3 = { type: cmd === "surface" ? "surface3d" : "bar3d", x: over[0], group: over[1], ys: [y], agg: O.stat || "mean", opts: {} };
      chart(`${O.stat || "mean"} of ${y} by ${over[0]} and ${over[1]}`, [over[0], over[1], y], cmd === "surface" ? t3 : t2, cmd === "surface" ? t2 : t3); break; }
    default: if (!stMore(cmd, { P, O, S, n, add, kv, vars, col, numv, sample, terms, chart, groupKeys, store, coefTable, out, clusterOf, seLabel, rest })) throw new Error(`to_${cmd} is not available.`);
  }
  if (!out.blocks.length && !out.msg) out.msg = "done";
  return out;
};
// ══════════════════════════════════════════════
// MORE STATA-STYLE COMMANDS (v30, from the Stata cheat sheets)
// Called from stRun's default branch with its helpers. Returns true when it handled the command.
// ══════════════════════════════════════════════
Object.assign(ST_CMDS, {
  mean: { st: "mean", g: "Describe data", syn: "to_mean gdp inflation [if] [, over(region) level(90)]", d: "Means with standard errors and confidence intervals" },
  proportion: { st: "proportion", g: "Describe data", syn: "to_proportion region [, over(year)]", d: "Share of rows in each category, with logit confidence intervals" },
  total: { st: "total", g: "Describe data", syn: "to_total aid [, over(region)]", d: "Column totals with standard errors" },
  ratio: { st: "ratio", g: "Describe data", syn: "to_ratio debt / gdp", d: "Ratio of two means with a standard error" },
  tabstat: { st: "tabstat", g: "Describe data", syn: "to_tabstat gdp inflation, stats(mean sd p50 min max n) [by(region)]", d: "Compact table of chosen statistics, optionally by group" },
  levelsof: { st: "levelsof", g: "Describe data", syn: "to_levelsof region", d: "The distinct values of a column" },
  isid: { st: "isid", g: "Describe data", syn: "to_isid country year", d: "Check that these columns identify each row once (error if not)" },
  assert: { st: "assert", g: "Describe data", syn: "to_assert gdp > 0", d: "Stop the script if any row breaks the condition" },
  inspect: { st: "inspect", g: "Describe data", syn: "to_inspect gdp", d: "Negative, zero, positive, integer, missing and unique counts" },
  stem: { st: "stem", g: "Describe data", syn: "to_stem inflation", d: "Stem-and-leaf display" },
  xtdescribe: { st: "xtdescribe", g: "Describe data", syn: "to_xtdescribe", d: "Panel units, periods and the most common participation patterns (needs to_xtset)" },
  xtsum: { st: "xtsum", g: "Describe data", syn: "to_xtsum gdp inflation", d: "Overall, between-unit and within-unit variation (needs to_xtset)" },
  prtest: { st: "prtest", g: "Estimate", syn: "to_prtest employed == 0.6   |   to_prtest employed, by(female)", d: "Test of a proportion (0/1 column), against a value or between two groups" },
  ranksum: { st: "ranksum", g: "Estimate", syn: "to_ranksum income, by(treated)", d: "Wilcoxon rank-sum (Mann-Whitney) test between two groups" },
  ksmirnov: { st: "ksmirnov", g: "Estimate", syn: "to_ksmirnov income, by(treated)", d: "Kolmogorov-Smirnov test that two groups share a distribution" },
  poisson: { st: "poisson", g: "Estimate", syn: "to_poisson count x1 x2 [, irr robust vce(cluster id)]", d: "Poisson regression for counts (irr shows incidence-rate ratios)" },
  estat: { st: "estat", g: "After estimation", syn: "to_estat hettest | ovtest | vif | ic", d: "After to_reg: Breusch-Pagan test, Ramsey RESET, variance inflation factors, AIC and BIC" },
  vif: { st: "estat vif", g: "After estimation", syn: "to_vif", d: "Variance inflation factors of the last regression" },
  lincom: { st: "lincom", g: "After estimation", syn: "to_lincom x1 + 2*x2   |   to_lincom x1 - x2", d: "Estimate, standard error and test of a combination of coefficients" },
  margins: { st: "margins", g: "After estimation", syn: "to_margins, dydx(*) [atmeans]   |   to_margins, eyex(x1)", d: "Average marginal effects (or elasticities) with delta-method standard errors" },
  rvfplot: { st: "rvfplot", g: "After estimation", syn: "to_rvfplot", d: "Residuals against fitted values of the last regression" },
  estimates: { st: "estimates", g: "After estimation", syn: "to_estimates store m1  |  to_estimates restore m1  |  to_estimates table [m1 m2]  |  to_estimates dir", d: "Name, reuse and compare stored models" },
  scalar: { st: "scalar", g: "After estimation", syn: "to_scalar avg = column_average(gdp)   |   to_scalar list", d: "Keep a single number; use it later as scalar(avg)" },
  bysort: { st: "bysort", g: "Change data", syn: "to_bysort country (year): to_gen first = _n == 1", d: "Sort by groups, then run a command within each group (_n and _N count inside the group)" },
  recode: { st: "recode", g: "Change data", syn: "to_recode score (0/49 = 1) (50/max = 2) (missing = .) [, gen(band)]", d: "Map values or ranges to new values (else, min, max and missing allowed)" },
  mvdecode: { st: "mvdecode", g: "Change data", syn: "to_mvdecode _all, mv(-99 -98)", d: "Turn codes such as -99 into blanks" },
  mvencode: { st: "mvencode", g: "Change data", syn: "to_mvencode income, mv(-99)", d: "Turn blanks into a code" },
  sample: { st: "sample", g: "Change data", syn: "to_sample 20 [, count seed(123)]", d: "Keep a random 20% of rows (count keeps 20 rows)" },
  xpose: { st: "xpose", g: "Change data", syn: "to_xpose [, varname]", d: "Swap rows and columns" },
  tostring: { st: "tostring", g: "Change data", syn: "to_tostring year [, format(%9.2f) gen(year_s)]", d: "Turn numbers into text, optionally with a fixed number of decimals" },
  decode: { st: "decode", g: "Change data", syn: "to_decode region_id, gen(region_name)", d: "Turn codes made by to_encode (earlier in the script) back into their labels" },
  order: { st: "order", g: "Change data", syn: "to_order country year [, last | after(x) | before(x)]", d: "Move columns" },
  merge: { st: "merge", g: "Change data", syn: "to_merge 1:1 country year using \"other dataset\" [, keep(match master) nogenerate]", d: "Join columns from another dataset by key columns (1:1, m:1 or 1:m); _merge shows 1 master only, 2 using only, 3 matched" },
  append: { st: "append", g: "Change data", syn: "to_append using \"other dataset\" [, gen(source)]", d: "Add the rows of another dataset below this one" },
  tsline: { st: "tsline", g: "Graphs", syn: "to_tsline gdp [inflation]", d: "Line over the time variable set with to_tsset or to_xtset" },
  xtline: { st: "xtline", g: "Graphs", syn: "to_xtline gdp", d: "One line per panel unit over time" },
  area: { st: "twoway area", g: "Graphs", syn: "to_area y [y2] x", d: "Area chart" },
  dot: { st: "graph dot", g: "Graphs", syn: "to_dot y, over(region) [stat(median)]", d: "Dot chart of a statistic per group" },
  vioplot: { st: "vioplot", g: "Graphs", syn: "to_vioplot y [, over(group)]", d: "Violin plot (distribution shape per group)" },
  bootstrap: { st: "bootstrap", g: "After estimation", syn: "to_bootstrap [_b[x]], reps(200) seed(1) cluster(county): to_reg y x  ;  to_predict v, resid  ;  to_reg z y v", d: "Bootstrap standard errors for any command or chain of commands (separate them with ;). cluster() resamples whole units; the last model's coefficients are bootstrapped" },
  binscatter: { st: "binscatter", g: "Graphs", syn: "to_binscatter y x [, nq(20)]", d: "Mean of y within equal-sized bins of x, with a fitted line" },
});
Object.assign(ST_ALIAS, { prop: "proportion", est: "estimates", estimate: "estimates", by: "bysort", graph_dot: "dot", violin: "vioplot", binsreg: "binscatter", xtdes: "xtdescribe", tostr: "tostring", hettest: "estat", ovtest: "estat", insp: "inspect" });
// LaTeX (booktabs) versions of result blocks
const stTexEsc = (x) => String(x ?? "").replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}")
  .replace(/²/g, "$^2$").replace(/≥/g, "$\\geq$").replace(/≤/g, "$\\leq$").replace(/≠/g, "$\\neq$").replace(/×/g, "$\\times$").replace(/·/g, "$\\cdot$").replace(/→/g, "$\\to$").replace(/[–—]/g, "--").replace(/χ/g, "$\\chi$").replace(/±/g, "$\\pm$").replace(/≈/g, "$\\approx$");
const stTexCell = (c) => { const s = String(c ?? ""); const m = s.match(/^(.*?)(\*+)$/); return m ? `${stTexEsc(m[1])}$^{${m[2]}}$` : stTexEsc(s); };
const stTexTable = (b, { caption = "", label = "", float = true } = {}) => { const n = Math.max(b.head.length, ...b.rows.map(r => r.length)); const hl = b.head.map(h => String(h ?? "").split("\n")); const L = Math.max(1, ...hl.map(x => x.length));
  const head = Array.from({ length: L }, (_, q) => Array.from({ length: n }, (_, j) => stTexEsc((hl[j] || [])[q] ?? "")).join(" & ") + " \\\\");
  const body = []; b.rows.forEach((r, ri) => { if (ri > 0 && /^(N|Observations|Number of obs)$/i.test(String(r[0]))) body.push("\\midrule"); body.push(Array.from({ length: n }, (_, j) => stTexCell(r[j])).join(" & ") + " \\\\"); });
  const tab = [`\\begin{tabular}{l${"r".repeat(Math.max(0, n - 1))}}`, "\\toprule", ...head, "\\midrule", ...body, "\\bottomrule", "\\end{tabular}"];
  const note = b.note ? [`\\par\\smallskip\\parbox{\\linewidth}{\\footnotesize ${stTexEsc(b.note)}}`] : [];
  if (!float) return [...tab, ...note].join("\n");
  return ["\\begin{table}[htbp]", "\\centering", ...(caption ? [`\\caption{${stTexEsc(caption)}}`] : []), ...(label ? [`\\label{${label}}`] : []), ...tab, ...note, "\\end{table}"].join("\n"); };
const stTexKv = (b) => ["\\begin{tabular}{lr}", "\\toprule", ...b.items.map(([a, v]) => `${stTexEsc(a)} & ${stTexCell(v)} \\\\`), "\\bottomrule", "\\end{tabular}", "\\par\\medskip"].join("\n");
// small OLS on row arrays: {b, rss, tss, r2}
const stOLS = (X, y) => { const k = X[0].length; const XtX = meZeros(k, k), Xty = new Array(k).fill(0); X.forEach((r, i) => { for (let a = 0; a < k; a++) { Xty[a] += r[a] * y[i]; for (let c = a; c < k; c++) XtX[a][c] += r[a] * r[c]; } }); for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) XtX[a][c] = XtX[c][a];
  const inv = stInv(XtX); if (!inv) return null; const b = meMV(inv, Xty); let rss = 0; const my = y.reduce((p, q) => p + q, 0) / y.length; let tss = 0; X.forEach((r, i) => { const e = y[i] - meDot(r, b); rss += e * e; tss += (y[i] - my) ** 2; }); return { b, rss, tss, r2: 1 - rss / tss, inv }; };
const stRng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const stKS = (lam) => { if (lam < 1e-8) return 1; let s = 0; for (let k = 1; k <= 100; k++) { const t = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lam * lam); s += t; if (Math.abs(t) < 1e-12) break; } return Math.max(0, Math.min(1, s)); };
const stDS = (S, name) => { const all = Object.values(S.datasets || {}); const nm = stUnq(name).toLowerCase(); const d = all.find(x => String(x.name).toLowerCase() === nm) || all.find(x => String(x.name).toLowerCase().startsWith(nm));
  if (!d) throw new Error(`No dataset called "${stUnq(name)}".${all.length ? ` Datasets: ${all.map(x => `"${x.name}"`).slice(0, 6).join(", ")}.` : " Upload or open another dataset first."}`); return d; };
const stMore = (cmd, X) => { const { P, O, S, n, add, kv, vars, numv, sample, terms, chart, groupKeys, store, coefTable, out } = X; const H = () => S.headers;
  const labOf = (g) => { const L = new Map(); if (g) S.cols[g].forEach(v => { const k = fxKey(v); if (k !== "" && !L.has(k)) L.set(k, fxS(v).trim()); }); return (k) => L.get(k) ?? k; };
  const optVar = (v) => v && v !== true ? vars(v, { max: 1 })[0] : "";
  const lastReg = (what) => { const e = S.est.last; if (!e) throw new Error(`Run to_reg first, then ${what}.`); if (e.link !== "id" || !e.use) throw new Error(`${what} works after to_reg (linear regression).`); if (e.n0 !== n) throw new Error(`Rows changed since the model ran. Put ${what} right after the model.`); return e; };
  const design = (e) => e.use.map(i => e.names.map((_, j) => e.vecs[j] ? e.vecs[j][i] : 1));
  const tcrit = (df, lvl = 95) => isFinite(df) ? meTQuant(1 - (1 - lvl / 100) / 2, df) : meInvNorm(1 - (1 - lvl / 100) / 2);
  const level = O.level ? +O.level : 95;
  const overKeys = () => { const g = optVar(O.over); return { g, keys: g ? S.cols[g].map(fxKey) : new Array(n).fill(""), lab: labOf(g) }; };
  switch (cmd) {
    // ── describe ──
    case "mean": case "total": { const vs = vars(P.main, { need: 1 }); const m = sample(); const { g, keys, lab } = overKeys(); const gl = [...new Set(keys.filter((k, i) => m[i] && k !== ""))].sort(); const lv = g ? gl : [""];
      const rows = []; vs.forEach(h => { const x = numv(h); lv.forEach(G => { const a = []; for (let i = 0; i < n; i++) if (m[i] && keys[i] === G && isFinite(x[i])) a.push(x[i]); const N = a.length; if (!N) return; const mu = a.reduce((p, q) => p + q, 0) / N; const sd = N > 1 ? Math.sqrt(a.reduce((p, q) => p + (q - mu) ** 2, 0) / (N - 1)) : NaN;
        const est = cmd === "mean" ? mu : mu * N, se = cmd === "mean" ? sd / Math.sqrt(N) : sd * Math.sqrt(N); const c = tcrit(N - 1, level); rows.push([g ? `${h} @ ${g}=${lab(G)}` : h, N.toLocaleString(), stFmt(est), stFmt(se), stFmt(est - c * se), stFmt(est + c * se)]); }); });
      add({ type: "table", head: ["", "Obs", cmd === "mean" ? "Mean" : "Total", "Std. err.", `[${level}% conf.`, "interval]"], num: true, rows }); out.msg = `${rows.length} ${cmd === "mean" ? "means" : "totals"}`; return true; }
    case "proportion": { const vs = vars(P.main, { need: 1 }); const m = sample(); const { g, keys, lab } = overKeys(); const rows = [];
      vs.forEach(h => { const lvAll = new Map(); S.cols[h].forEach((v, i) => { if (m[i] && !FXB(v)) lvAll.set(fxKey(v), fxS(v).trim()); }); const lv = [...lvAll.keys()].sort((a, b) => isFinite(+a) && isFinite(+b) ? a - b : a.localeCompare(b));
        const groupsL = g ? [...new Set(keys.filter((k, i) => m[i] && k !== ""))].sort() : [""];
        groupsL.forEach(G => { const idx = []; for (let i = 0; i < n; i++) if (m[i] && keys[i] === G && !FXB(S.cols[h][i])) idx.push(i); const N = idx.length; if (!N) return; const c = tcrit(N - 1, level);
          lv.forEach(L => { const k = idx.filter(i => fxKey(S.cols[h][i]) === L).length; const p = k / N; const se = N > 1 ? Math.sqrt(p * (1 - p) / (N - 1)) : NaN; let lo = 0, hi = 1; if (p > 0 && p < 1) { const l = Math.log(p / (1 - p)), d = c * se / (p * (1 - p)); lo = 1 / (1 + Math.exp(-(l - d))); hi = 1 / (1 + Math.exp(-(l + d))); }
            rows.push([`${h}=${lvAll.get(L)}${g ? ` @ ${g}=${lab(G)}` : ""}`, N.toLocaleString(), stFmt(p, 4), stFmt(se, 4), stFmt(lo, 4), stFmt(hi, 4)]); }); }); });
      add({ type: "table", head: ["", "Obs", "Proportion", "Std. err.", `[${level}% conf.`, "interval]"], num: true, rows, note: "Logit-transformed intervals." }); out.msg = `${rows.length} proportions`; return true; }
    case "ratio": { const t = P.main.replace("/", " "); const [a, b] = vars(t, { need: 2, max: 2 }); const m = sample(); const ya = numv(a), xb = numv(b); const idx = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(ya[i]) && isFinite(xb[i])) idx.push(i); const N = idx.length; if (N < 2) throw new Error("Not enough rows.");
      const my = idx.reduce((s, i) => s + ya[i], 0) / N, mx = idx.reduce((s, i) => s + xb[i], 0) / N; const r = my / mx; const d = idx.map(i => (ya[i] - r * xb[i]) / mx); const md = d.reduce((p, q) => p + q, 0) / N; const se = Math.sqrt(d.reduce((p, q) => p + (q - md) ** 2, 0) / (N - 1)) / Math.sqrt(N); const c = tcrit(N - 1, level);
      add({ type: "table", head: ["", "Obs", "Ratio", "Std. err.", `[${level}% conf.`, "interval]"], num: true, rows: [[`${a}/${b}`, N.toLocaleString(), stFmt(r), stFmt(se), stFmt(r - c * se), stFmt(r + c * se)]] }); out.msg = `${a}/${b} = ${stFmt(r)}`; return true; }
    case "tabstat": { const vs = vars(P.main, { need: 1 }); const m = sample(); const by = optVar(O.by); const keys = by ? S.cols[by].map(fxKey) : new Array(n).fill(""); const st = String(O.stats || O.statistics || O.s || "mean").replace(/[,]/g, " ").split(/\s+/).filter(Boolean).map(x => x.toLowerCase());
      const calc = (a, s) => { const N = a.length; if (!N) return NaN; const srt = a.slice().sort((p, q) => p - q); const mu = a.reduce((p, q) => p + q, 0) / N; const v = N > 1 ? a.reduce((p, q) => p + (q - mu) ** 2, 0) / (N - 1) : NaN; const q = (f) => { const hh = (N - 1) * f, lo = Math.floor(hh); return srt[lo] + (srt[Math.min(lo + 1, N - 1)] - srt[lo]) * (hh - lo); };
        const pm = s.match(/^p(\d+)$/); if (pm) return q(+pm[1] / 100); const m2 = a.reduce((p, x) => p + (x - mu) ** 2, 0) / N;
        return { mean: mu, sd: Math.sqrt(v), sum: mu * N, n: N, count: N, min: srt[0], max: srt[N - 1], range: srt[N - 1] - srt[0], median: q(.5), iqr: q(.75) - q(.25), var: v, variance: v, cv: Math.sqrt(v) / mu, semean: Math.sqrt(v / N), skewness: N > 2 ? (a.reduce((p, x) => p + (x - mu) ** 3, 0) / N) / Math.pow(m2, 1.5) : NaN, kurtosis: N > 3 ? (a.reduce((p, x) => p + (x - mu) ** 4, 0) / N) / (m2 * m2) : NaN }[s]; };
      st.forEach(s => { if (!/^p\d+$/.test(s) && calc([1, 2, 3, 4], s) === undefined) throw new Error(`Unknown statistic ${s}. Use mean sd sum n min max range median p1-p99 iqr var cv semean skewness kurtosis.`); });
      const gl = by ? [...new Set(keys.filter((k, i) => m[i] && k !== ""))].sort((a, b) => isFinite(+a) && isFinite(+b) ? a - b : a.localeCompare(b)) : []; const lb = labOf(by); const groupsL = [...gl.map(G => [lb(G), G]), ["Total", null]];
      const rows = []; groupsL.forEach(([lab, G]) => st.forEach((s, k) => { const r = [k === 0 ? (by ? lab : "") : "", s]; vs.forEach(h => { const x = numv(h); const a = []; for (let i = 0; i < n; i++) if (m[i] && (G === null || keys[i] === G) && isFinite(x[i])) a.push(x[i]); r.push(stFmt(calc(a, s))); }); rows.push(r); }));
      add({ type: "table", head: by ? [by, "Stat", ...vs] : ["Stat", ...vs], num: true, rows: by ? rows : rows.map(r => r.slice(1)) }); out.msg = `${st.join(", ")} of ${vs.join(", ")}${by ? ` by ${by}` : ""}`; return true; }
    case "levelsof": { const h = vars(P.main, { need: 1, max: 1 })[0]; const m = sample(); const lv = new Map(); S.cols[h].forEach((v, i) => { if (m[i] && !FXB(v)) lv.set(fxKey(v), fxS(v).trim()); }); const ks = [...lv.keys()].sort((a, b) => isFinite(+a) && isFinite(+b) ? a - b : a.localeCompare(b)); const txt = ks.map(k => { const v = lv.get(k); return isFinite(+v) ? v : `"${v}"`; }).join(" ");
      add({ type: "text", text: txt.length > 6000 ? txt.slice(0, 6000) + " …" : txt }); S.est.r = { ...(S.est.r || {}), r: ks.length }; out.msg = `${ks.length} distinct values`; return true; }
    case "isid": { const vs = vars(P.main, { need: 1 }); const seen = new Map(); let dup = 0, miss = 0; for (let i = 0; i < n; i++) { if (vs.some(h => FXB(S.cols[h][i]))) { miss++; continue; } const k = vs.map(h => fxKey(S.cols[h][i])).join("\u0001"); if (seen.has(k)) dup++; else seen.set(k, i); }
      if (miss) throw new Error(`${vs.join(" ")}: ${miss} rows have a blank key, so these columns do not identify every row.`); if (dup) throw new Error(`${vs.join(" ")} do not uniquely identify the rows: ${dup} rows repeat a key. Try  to_duplicates report ${vs.join(" ")}`);
      out.msg = `${vs.join(" ")} identify all ${n.toLocaleString()} rows`; return true; }
    case "assert": { const cond = (P.main + (P.cond ? ` if ${P.cond}` : "")).trim(); if (!cond) throw new Error("Syntax: to_assert condition"); const v = S.evalExpr(P.main).map(fxTruth); const m = P.cond ? S.evalExpr(P.cond).map(fxTruth) : null; let bad = 0, tot = 0; for (let i = 0; i < n; i++) { if (m && m[i] !== 1) continue; tot++; if (v[i] !== 1) bad++; }
      if (bad) throw new Error(`Assertion is false: ${bad.toLocaleString()} contradiction${bad === 1 ? "" : "s"} in ${tot.toLocaleString()} rows (${P.main.trim()}).`); out.msg = `true for all ${tot.toLocaleString()} rows`; return true; }
    case "inspect": { const vs = vars(P.main || "_all"); const m = sample(); const rows = vs.map(h => { let neg = 0, zero = 0, pos = 0, int = 0, non = 0, miss = 0, txt = 0; const u = new Set(); S.cols[h].forEach((v, i) => { if (!m[i]) return; if (FXB(v)) { miss++; return; } u.add(fxKey(v)); const x = fxNum(v); if (!isFinite(x)) { txt++; return; } if (x < 0) neg++; else if (x === 0) zero++; else pos++; if (Number.isInteger(x)) int++; else non++; });
        return [h, neg, zero, pos, int, non, txt, miss, u.size > 99 ? "more than 99" : u.size].map(x => typeof x === "number" ? x.toLocaleString() : x); });
      add({ type: "table", head: ["Variable", "Negative", "Zero", "Positive", "Integers", "Non-integers", "Text", "Missing", "Unique"], num: true, rows }); out.msg = `${vs.length} variable${vs.length > 1 ? "s" : ""}`; return true; }
    case "stem": { const h = vars(P.main, { need: 1, max: 1 })[0]; const m = sample(); const x = numv(h).filter((v, i) => m[i] && isFinite(v)).sort((a, b) => a - b); if (!x.length) throw new Error(`${h} has no numbers.`);
      const rg = x[x.length - 1] - x[0] || Math.abs(x[0]) || 1; const unit = Math.pow(10, Math.floor(Math.log10(rg)) - 1); const st = new Map(); x.forEach(v => { const sc = Math.round(v / unit); const tr = Math.abs(Math.trunc(sc / 10)); const key = (sc < 0 ? "-" : "") + tr; if (!st.has(key)) st.set(key, { ord: sc < 0 ? -(tr + 0.5) : tr, leaves: [] }); st.get(key).leaves.push(Math.abs(sc) % 10); });
      const lines = [...st.entries()].sort((a, b) => a[1].ord - b[1].ord).map(([k, v]) => `${k.padStart(6)} | ${(v.ord < 0 ? v.leaves.slice().reverse() : v.leaves).join("")}`); add({ type: "text", text: `Stem-and-leaf plot for ${h} (leaf unit ${stFmt(unit)}; 12|3 means ${stFmt(123 * unit)})\n\n${lines.slice(0, 200).join("\n")}` }); out.msg = `${x.length} values`; return true; }
    case "xtdescribe": case "xtsum": { const u = S.unit, t = S.time; if (!u) throw new Error(`to_${cmd} needs the panel unit and time. Add  to_xtset country year  above it.`);
      if (cmd === "xtdescribe") { const units = new Map(); const times = new Set(); for (let i = 0; i < n; i++) { const a = fxKey(S.cols[u][i]); if (a === "") continue; const b = t ? fxKey(S.cols[t][i]) : String(i); times.add(b); if (!units.has(a)) units.set(a, new Set()); units.get(a).add(b); }
        const T = [...times].sort((a, b) => isFinite(+a) && isFinite(+b) ? a - b : a.localeCompare(b)); const pat = new Map(); units.forEach(s => { const p = T.map(x => s.has(x) ? "1" : ".").join(""); pat.set(p, (pat.get(p) || 0) + 1); }); const cnt = [...units.values()].map(s => s.size).sort((a, b) => a - b); const q = (f) => cnt[Math.min(cnt.length - 1, Math.floor((cnt.length - 1) * f))];
        kv([[`${u} (units)`, units.size.toLocaleString()], [`${t || "time"} (periods)`, `${T.length.toLocaleString()}${T.length ? ` (${T[0]} to ${T[T.length - 1]})` : ""}`], ["Balanced", cnt[0] === T.length ? "yes" : "no"], ["Periods per unit: min / 25% / 50% / 75% / max", `${cnt[0]} / ${q(.25)} / ${q(.5)} / ${q(.75)} / ${cnt[cnt.length - 1]}`]]);
        add({ type: "table", head: ["Freq.", "Percent", "Pattern"], num: true, rows: [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([p, f]) => [f.toLocaleString(), (100 * f / units.size).toFixed(1), T.length > 60 ? p.slice(0, 60) + "…" : p]), note: "1 = the unit has data in that period, . = it does not (periods in order)." }); out.msg = `${units.size} units, ${T.length} periods`; return true; }
      const vs = vars(P.main, { need: 1 }); const rows = []; vs.forEach(h => { const x = numv(h); const by = new Map(); const all = []; for (let i = 0; i < n; i++) { if (!isFinite(x[i])) continue; const k = fxKey(S.cols[u][i]); if (k === "") continue; if (!by.has(k)) by.set(k, []); by.get(k).push(x[i]); all.push(x[i]); } const N = all.length; if (!N) return;
        const mu = all.reduce((a, b) => a + b, 0) / N; const sd = (a) => { const mm = a.reduce((p, q) => p + q, 0) / a.length; return a.length > 1 ? Math.sqrt(a.reduce((p, q) => p + (q - mm) ** 2, 0) / (a.length - 1)) : NaN; };
        const means = [...by.values()].map(a => a.reduce((p, q) => p + q, 0) / a.length); const within = []; by.forEach(a => { const mm = a.reduce((p, q) => p + q, 0) / a.length; a.forEach(v => within.push(v - mm + mu)); });
        rows.push([h, "overall", stFmt(mu), stFmt(sd(all)), stFmt(Math.min(...all)), stFmt(Math.max(...all)), `N = ${N.toLocaleString()}`], ["", "between", "", stFmt(sd(means)), stFmt(Math.min(...means)), stFmt(Math.max(...means)), `n = ${by.size.toLocaleString()}`], ["", "within", "", stFmt(sd(within)), stFmt(Math.min(...within)), stFmt(Math.max(...within)), `T-bar = ${stFmt(N / by.size, 4)}`]); });
      add({ type: "table", head: ["Variable", "", "Mean", "Std. dev.", "Min", "Max", "Observations"], num: true, rows }); out.msg = `${vs.length} variable${vs.length > 1 ? "s" : ""} by ${u}`; return true; }

    // ── tests ──
    case "prtest": { const eq = P.main.match(/^(.+?)==\s*(.+)$/); const m = sample(); const z2 = (z) => [stFmt(z, 4), stP(2 * (1 - meNormCdf(Math.abs(z)))), stP(1 - meNormCdf(z)), stP(meNormCdf(z))];
      const props = (h, rowsIn) => { const x = numv(h); const a = rowsIn.filter(i => isFinite(x[i])).map(i => x[i]); if (a.some(v => v !== 0 && v !== 1)) throw new Error(`${h} must hold only 0 and 1 for to_prtest.`); return { N: a.length, p: a.reduce((s, v) => s + v, 0) / (a.length || 1) }; };
      const all = []; for (let i = 0; i < n; i++) if (m[i]) all.push(i);
      if (eq && isFinite(fxNum(eq[2].trim()))) { const h = vars(eq[1], { max: 1 })[0]; const p0 = fxNum(eq[2].trim()); const { N, p } = props(h, all); const z = (p - p0) / Math.sqrt(p0 * (1 - p0) / N); const se = Math.sqrt(p * (1 - p) / N); const c = tcrit(Infinity, level);
        add({ type: "table", head: ["Variable", "Obs", "Proportion", "Std. err.", `[${level}% conf.`, "interval]"], num: true, rows: [[h, N.toLocaleString(), stFmt(p, 5), stFmt(se, 5), stFmt(p - c * se, 5), stFmt(p + c * se, 5)]] });
        const [zz, p2, pu, pl] = z2(z); kv([["H0", `p = ${p0}`], ["z", zz], ["Pr(|Z| > |z|)", p2], ["Pr(Z > z)", pu], ["Pr(Z < z)", pl]]); out.msg = `z = ${zz}, p = ${p2}`; return true; }
      const by = optVar(O.by); if (!by) throw new Error(`Syntax: ${ST_CMDS.prtest.syn}`); const h = vars(eq ? eq[1] : P.main, { max: 1 })[0]; const lv = [...new Set(all.map(i => fxKey(S.cols[by][i])).filter(k => k !== ""))].sort(); if (lv.length !== 2) throw new Error(`${by} must have exactly two groups here (it has ${lv.length}).`);
      const A = props(h, all.filter(i => fxKey(S.cols[by][i]) === lv[0])), B = props(h, all.filter(i => fxKey(S.cols[by][i]) === lv[1])); const pp = (A.p * A.N + B.p * B.N) / (A.N + B.N); const z = (A.p - B.p) / Math.sqrt(pp * (1 - pp) * (1 / A.N + 1 / B.N)); const se = Math.sqrt(A.p * (1 - A.p) / A.N + B.p * (1 - B.p) / B.N); const c = tcrit(Infinity, level);
      add({ type: "table", head: ["Group", "Obs", "Proportion", "Std. err."], num: true, rows: [[`${by}=${lv[0]}`, A.N.toLocaleString(), stFmt(A.p, 5), stFmt(Math.sqrt(A.p * (1 - A.p) / A.N), 5)], [`${by}=${lv[1]}`, B.N.toLocaleString(), stFmt(B.p, 5), stFmt(Math.sqrt(B.p * (1 - B.p) / B.N), 5)], ["diff", "", stFmt(A.p - B.p, 5), stFmt(se, 5)]] });
      const [zz, p2, pu, pl] = z2(z); kv([["diff 95% CI", `${stFmt(A.p - B.p - c * se, 5)} to ${stFmt(A.p - B.p + c * se, 5)}`], ["H0", "diff = 0"], ["z", zz], ["Pr(|Z| > |z|)", p2], ["Pr(Z > z)", pu], ["Pr(Z < z)", pl]]); out.msg = `z = ${zz}, p = ${p2}`; return true; }
    case "ranksum": case "ksmirnov": { const h = vars(P.main, { need: 1, max: 1 })[0]; const by = optVar(O.by); if (!by) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); const m = sample(); const x = numv(h);
      const lb = labOf(by); const rows = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(x[i]) && !FXB(S.cols[by][i])) rows.push(i); const lv = [...new Set(rows.map(i => fxKey(S.cols[by][i])))].sort((a, b) => isFinite(+a) && isFinite(+b) ? a - b : a.localeCompare(b)); if (lv.length !== 2) throw new Error(`${by} must have exactly two groups here (it has ${lv.length}).`);
      const g1 = rows.filter(i => fxKey(S.cols[by][i]) === lv[0]).map(i => x[i]), g2 = rows.filter(i => fxKey(S.cols[by][i]) === lv[1]).map(i => x[i]); const n1 = g1.length, n2 = g2.length, N = n1 + n2;
      if (cmd === "ranksum") { const all = [...g1.map(v => [v, 0]), ...g2.map(v => [v, 1])].sort((a, b) => a[0] - b[0]); const rk = new Array(N); let ties = 0; for (let i = 0; i < N;) { let j = i; while (j + 1 < N && all[j + 1][0] === all[i][0]) j++; const r = (i + j) / 2 + 1; for (let q = i; q <= j; q++) rk[q] = r; const t = j - i + 1; ties += t * t * t - t; i = j + 1; }
        let R1 = 0; all.forEach((a, q) => { if (a[1] === 0) R1 += rk[q]; }); const E = n1 * (N + 1) / 2; const V = n1 * n2 * (N + 1) / 12 - n1 * n2 * ties / (12 * N * (N - 1)); const z = (R1 - E) / Math.sqrt(V);
        add({ type: "table", head: [by, "Obs", "Rank sum", "Expected"], num: true, rows: [[lb(lv[0]), n1, stFmt(R1), stFmt(E)], [lb(lv[1]), n2, stFmt(N * (N + 1) / 2 - R1), stFmt(n2 * (N + 1) / 2)], ["Combined", N, stFmt(N * (N + 1) / 2), stFmt(N * (N + 1) / 2)]] });
        kv([["Unadjusted variance", stFmt(n1 * n2 * (N + 1) / 12)], ["Adjustment for ties", stFmt(-n1 * n2 * ties / (12 * N * (N - 1)))], ["Adjusted variance", stFmt(V)], ["H0", `${h}(${by}==${lb(lv[0])}) = ${h}(${by}==${lb(lv[1])})`], ["z", stFmt(z, 4)], ["Prob > |z|", stP(2 * (1 - meNormCdf(Math.abs(z))))]]); out.msg = `z = ${stFmt(z, 4)}`; return true; }
      const s1 = g1.slice().sort((a, b) => a - b), s2 = g2.slice().sort((a, b) => a - b); const pts = [...new Set([...s1, ...s2])].sort((a, b) => a - b); let i1 = 0, i2 = 0, Dp = 0, Dm = 0; pts.forEach(v => { while (i1 < n1 && s1[i1] <= v) i1++; while (i2 < n2 && s2[i2] <= v) i2++; const d = i1 / n1 - i2 / n2; Dp = Math.max(Dp, d); Dm = Math.max(Dm, -d); });
      const D = Math.max(Dp, Dm); const en = Math.sqrt(n1 * n2 / N); const pc = stKS((en + 0.12 + 0.11 / en) * D);
      add({ type: "table", head: ["Smaller group", "D", "p-value"], num: true, rows: [[`${by}=${lb(lv[0])}`, stFmt(Dp, 4), stP(Math.exp(-2 * en * en * Dp * Dp))], [`${by}=${lb(lv[1])}`, stFmt(-Dm, 4), stP(Math.exp(-2 * en * en * Dm * Dm))], ["Combined K-S", stFmt(D, 4), stP(pc)]], note: "Asymptotic p-values." }); out.msg = `D = ${stFmt(D, 4)}, p = ${stP(pc)}`; return true; }
    case "poisson": { const tk = terms(P.main); if (tk.length < 2) throw new Error(`Syntax: ${ST_CMDS.poisson.syn}`); const y = tk[0], xs = tk.slice(1); const m = sample(); const cl = X.clusterOf(); const rob = !!(O.robust || O.r || O.vce === "robust");
      const use = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(y.v[i]) && xs.every(t => isFinite(t.v[i])) && (!cl || !FXB(S.cols[cl][i]))) use.push(i); if (use.some(i => y.v[i] < 0)) throw new Error(`${y.name} has negative values; Poisson needs counts (0, 1, 2, ...).`);
      let names = [...xs.map(t => t.name), "_cons"]; let Xm = use.map(i => [...xs.map(t => t.v[i]), 1]); const keep = stKeepCols(Xm); if (keep.length < names.length) { Xm = Xm.map(r => keep.map(j => r[j])); names = keep.map(j => names[j]); }
      const yv = use.map(i => y.v[i]); const N = yv.length, k = names.length; if (N <= k) throw new Error("Not enough rows for this model."); const ybar = yv.reduce((a, b) => a + b, 0) / N; if (!(ybar > 0)) throw new Error(`${y.name} is zero everywhere.`);
      let b = new Array(k).fill(0); b[k - 1] = Math.log(ybar); let inv = null, it = 0; const lf = (yy) => meLnGamma(yy + 1); const LL = (bb) => { let s = 0; Xm.forEach((r, i) => { const xb = meDot(r, bb); s += yv[i] * xb - Math.exp(xb) - lf(yv[i]); }); return s; };
      for (; it < 100; it++) { const I = meZeros(k, k), g = new Array(k).fill(0); Xm.forEach((r, i) => { const mu = Math.exp(meDot(r, b)); for (let a = 0; a < k; a++) { g[a] += (yv[i] - mu) * r[a]; for (let c = a; c < k; c++) I[a][c] += mu * r[a] * r[c]; } }); for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) I[a][c] = I[c][a]; inv = stInv(I); if (!inv) throw new Error("The model could not be estimated (perfectly collinear or separated)."); const step = meMV(inv, g);
        let t = 1, nb; const l0 = LL(b); do { nb = b.map((v, j) => v + t * step[j]); t /= 2; } while (LL(nb) < l0 - 1e-10 && t > 1e-6); b = nb; if (Math.max(...step.map(Math.abs)) < 1e-10) break; }
      { const I = meZeros(k, k); Xm.forEach(r => { const mu = Math.exp(meDot(r, b)); for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) I[a][c] += mu * r[a] * r[c]; }); inv = stInv(I); }
      let V = inv, G = 0; if (rob || cl) { const sc = Xm.map((r, i) => { const e = yv[i] - Math.exp(meDot(r, b)); return r.map(x => x * e); }); let groupsS = sc; if (cl) { const gm = new Map(); use.forEach((i, q) => { const key = fxKey(S.cols[cl][i]); if (!gm.has(key)) gm.set(key, new Array(k).fill(0)); const a = gm.get(key); for (let j = 0; j < k; j++) a[j] += sc[q][j]; }); groupsS = [...gm.values()]; G = gm.size; S.est.lastG = G; }
        const M = meZeros(k, k); groupsS.forEach(s => { for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) M[a][c] += s[a] * s[c]; }); const f = cl ? G / (G - 1) : N / (N - 1); V = meMatMul(meMatMul(inv, M), inv).map(r => r.map(x => x * f)); }
      const se = V.map((r, j) => Math.sqrt(Math.max(0, r[j]))); const ll = LL(b); const ll0 = yv.reduce((s, yy) => s + yy * Math.log(ybar) - ybar - lf(yy), 0); const lr = 2 * (ll - ll0);
      kv([["Number of obs", N.toLocaleString()], [rob || cl ? `Wald chi2(${k - 1})` : `LR chi2(${k - 1})`, stFmt(rob || cl ? meWald(b, V, names.map((_, j) => j).filter(j => names[j] !== "_cons")).chi2 : lr, 5)], ["Prob > chi2", stP(rob || cl ? meWald(b, V, names.map((_, j) => j).filter(j => names[j] !== "_cons")).pChi2 : meChi2Pval(lr, k - 1))], ["Pseudo R2", (1 - ll / ll0).toFixed(4)], ["Log likelihood", stFmt(ll, 8)], ["Iterations", it + 1]]);
      if (O.irr) { add({ type: "table", head: ["", "IRR", "Std. err.", "z", "P>|z|", "[95% conf.", "interval]"], num: true, rows: names.map((nm, j) => { const z = b[j] / se[j]; const p = 2 * (1 - meNormCdf(Math.abs(z))); return [nm, stFmt(Math.exp(b[j]), 7) + stStars(p), stFmt(Math.exp(b[j]) * se[j], 7), stFmt(z, 4), stP(p), stFmt(Math.exp(b[j] - 1.959963984540054 * se[j]), 7), stFmt(Math.exp(b[j] + 1.959963984540054 * se[j]), 7)]; }) }); }
      else add(coefTable(names, b, se, Infinity, true));
      add({ type: "note", text: X.seLabel(cl, rob) }); const cdf = Math.exp; const pdf = Math.exp;
      store({ cmd, title: `Poisson of ${y.name}`, depvar: y.name, yvec: y.v, names, b, se, V, df: Infinity, N, r2: 1 - ll / ll0, isZ: true, vecs: names.map(nm => nm === "_cons" ? null : (xs.find(t => t.name === nm) || {}).v), n0: n, link: "log", cdf, pdf, use, ll }); return true; }

    // ── after estimation ──
    case "estat": case "vif": { const sub = cmd === "vif" ? "vif" : (stTokens(P.main)[0] || "").toLowerCase(); const e = S.est.last; if (!e) throw new Error("Run a model first.");
      if (sub === "ic") { const k = e.names.length; const ll = e.ll != null ? e.ll : e.rss != null ? -e.N / 2 * (Math.log(2 * Math.PI) + Math.log(e.rss / e.N) + 1) : NaN; if (!isFinite(ll)) throw new Error("to_estat ic needs to_reg, to_logit, to_probit or to_poisson.");
        add({ type: "table", head: ["Model", "N", "ll(model)", "df", "AIC", "BIC"], num: true, rows: [[e.name, e.N.toLocaleString(), stFmt(ll, 8), k, stFmt(-2 * ll + 2 * k, 8), stFmt(-2 * ll + k * Math.log(e.N), 8)]] }); out.msg = `AIC ${stFmt(-2 * ll + 2 * k, 7)}`; return true; }
      const er = lastReg(`to_estat ${sub}`); if (er.fe && er.fe.length) throw new Error(`to_estat ${sub} works after to_reg without absorbed fixed effects.`); const Xd = design(er); const yv = new Array(er.use.length).fill(0); const yy = numv(S.findCol(er.depvar) || er.depvar); er.use.forEach((i, q) => { yv[q] = yy[i]; }); const fit = Xd.map(r => meDot(r, er.b)); const N = Xd.length;
      if (sub === "hettest") { const rss = yv.reduce((s, v, q) => s + (v - fit[q]) ** 2, 0); const s2 = rss / N; const z = yv.map((v, q) => (v - fit[q]) ** 2 / s2); const r = stOLS(fit.map(f => [f, 1]), z); const mz = z.reduce((a, b) => a + b, 0) / N; const ess = z.reduce((s, v) => s + (v - mz) ** 2, 0) - r.rss; const chi = ess / 2;
        add({ type: "text", text: "Breusch-Pagan / Cook-Weisberg test for heteroskedasticity\nAssumption: normal error terms\nVariable: fitted values of " + er.depvar + "\nH0: constant variance" }); kv([["chi2(1)", stFmt(chi, 5)], ["Prob > chi2", stP(meChi2Pval(chi, 1))]]); out.msg = `chi2(1) = ${stFmt(chi, 5)}, p = ${stP(meChi2Pval(chi, 1))}`; return true; }
      if (sub === "ovtest") { const mf = fit.reduce((a, b) => a + b, 0) / N, sf = Math.sqrt(fit.reduce((s, v) => s + (v - mf) ** 2, 0) / (N - 1)); const zf = fit.map(f => (f - mf) / sf); const Xu = Xd.map((r, q) => [...r, zf[q] ** 2, zf[q] ** 3, zf[q] ** 4]); const ru = stOLS(Xu, yv); const rr = stOLS(Xd, yv); if (!ru || !rr) throw new Error("RESET could not be computed (collinear powers).");
        const df2 = N - Xu[0].length; const F = ((rr.rss - ru.rss) / 3) / (ru.rss / df2); add({ type: "text", text: `Ramsey RESET test for omitted variables\nOmitted: powers of fitted values of ${er.depvar}\nH0: model has no omitted variables` }); kv([[`F(3, ${df2})`, stFmt(F, 5)], ["Prob > F", stP(meFPval(F, 3, df2))]]); out.msg = `F(3, ${df2}) = ${stFmt(F, 4)}, p = ${stP(meFPval(F, 3, df2))}`; return true; }
      if (sub === "vif") { const ci = er.names.indexOf("_cons"); const idx = er.names.map((_, j) => j).filter(j => j !== ci); if (idx.length < 2) throw new Error("VIF needs at least two regressors."); const rows = idx.map(j => { const others = idx.filter(q => q !== j); const r = stOLS(Xd.map(row => [...others.map(q => row[q]), 1]), Xd.map(row => row[j])); const v = r ? 1 / (1 - r.r2) : NaN; return [er.names[j], v]; }).sort((a, b) => b[1] - a[1]);
        const mean = rows.reduce((s, r) => s + r[1], 0) / rows.length; add({ type: "table", head: ["Variable", "VIF", "1/VIF"], num: true, rows: [...rows.map(r => [r[0], stFmt(r[1], 4), stFmt(1 / r[1], 4)]), ["Mean VIF", stFmt(mean, 4), ""]], note: "Values above 10 are a common warning sign of collinearity." }); out.msg = `mean VIF ${stFmt(mean, 4)}`; return true; }
      throw new Error("Use  to_estat hettest,  to_estat ovtest,  to_estat vif  or  to_estat ic"); }
    case "lincom": { const e = S.est.last; if (!e) throw new Error("Run a model first, then to_lincom."); const expr = (P.main + (P.optRaw ? "," + P.optRaw : "")).trim().replace(/,.*$/, ""); if (!expr) throw new Error(`Syntax: ${ST_CMDS.lincom.syn}`);
      const order = e.names.map((nm, j) => [nm, j]).sort((a, b) => b[0].length - a[0].length); const sub = (bb) => { let s = expr.replace(/_b\[([^\]]+)\]/g, (_, v) => { const j = e.names.indexOf(v.trim()); if (j < 0) throw new Error(`${v} is not in the last model (${e.names.join(", ")}).`); return `(${bb[j]})`; });
        order.forEach(([nm, j]) => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) return; s = s.replace(new RegExp(`(^|[^A-Za-z0-9_.])${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_(])`, "g"), (all, pre) => `${pre}(${bb[j]})`); }); const v = fxEval(fxParse(s), { cols: {}, n: 1, groups: [[0]] })[0]; if (typeof v !== "number" || !isFinite(v)) throw new Error(`Could not read "${expr}". Use coefficient names from the last model: ${e.names.join(", ")}.`); return v; };
      const z0 = new Array(e.b.length).fill(0); const c0 = sub(z0); const a = e.b.map((_, j) => { const u = z0.slice(); u[j] = 1; return sub(u) - c0; }); const est = sub(e.b); const se = Math.sqrt(Math.max(0, meQF(a, e.V))); const t = (est - 0) / se; const isZ = e.isZ || !isFinite(e.df); const p = isZ ? 2 * (1 - meNormCdf(Math.abs(t))) : meTPval(t, e.df); const c = tcrit(isZ ? Infinity : e.df, level);
      add({ type: "table", head: ["", "Coefficient", "Std. err.", isZ ? "z" : "t", isZ ? "P>|z|" : "P>|t|", `[${level}% conf.`, "interval]"], num: true, rows: [[`(1) ${expr}`, stFmt(est, 7) + stStars(p), stFmt(se, 7), stFmt(t, 4), stP(p), stFmt(est - c * se, 7), stFmt(est + c * se, 7)]] }); S.est.r = { ...(S.est.r || {}), estimate: est, se, p }; out.msg = `${expr} = ${stFmt(est)} (p = ${stP(p)})`; return true; }
    case "margins": { const e = S.est.last; if (!e) throw new Error("Run a model first, then to_margins."); if (!e.use) throw new Error("to_margins works after to_reg, to_logit, to_probit or to_poisson."); if (e.n0 !== n) throw new Error("Rows changed since the model ran. Put to_margins right after the model.");
      const mode = O.eyex ? "eyex" : "dydx"; const spec = String(O[mode] === true || O[mode] == null ? "*" : O[mode]).trim(); const want = spec === "*" || spec === "_all" ? e.names.filter(x => x !== "_cons") : stTokens(spec).flatMap(t => { const tt = stUnq(t); const hit = e.names.filter(x => x === tt || x.startsWith(tt + "=")); if (!hit.length) throw new Error(`${tt} is not in the last model (${e.names.join(", ")}).`); return hit; });
      const Xd = design(e); const lin = e.link === "id"; const F = lin ? (z) => z : e.cdf; const f = lin ? () => 1 : e.pdf; const atm = !!O.atmeans; const Xm = atm ? [e.names.map((_, j) => Xd.reduce((s, r) => s + r[j], 0) / Xd.length)] : Xd;
      const eff = (bb, j) => { const nm = e.names[j]; const dummy = nm.includes("=") && Xm.every(r => r[j] === 0 || r[j] === 1) && !atm; let s = 0; Xm.forEach(r => { const xb = meDot(r, bb); let d; if (dummy) { const r1 = r.slice(), r0 = r.slice(); r1[j] = 1; r0[j] = 0; d = F(meDot(r1, bb)) - F(meDot(r0, bb)); } else d = f(xb) * bb[j]; if (mode === "eyex") { const yh = F(xb); d = d * r[j] / yh; } s += d; }); return s / Xm.length; };
      const rows = want.map(nm => { const j = e.names.indexOf(nm); const est = eff(e.b, j); const g = e.b.map((bj, q) => { const h = 1e-6 * Math.max(1, Math.abs(bj)); const bp = e.b.slice(), bm = e.b.slice(); bp[q] += h; bm[q] -= h; return (eff(bp, j) - eff(bm, j)) / (2 * h); }); const se = Math.sqrt(Math.max(0, meQF(g, e.V))); const z = est / se; const p = 2 * (1 - meNormCdf(Math.abs(z)));
        return [nm, stFmt(est, 7) + stStars(p), stFmt(se, 7), stFmt(z, 4), stP(p), stFmt(est - 1.959963984540054 * se, 7), stFmt(est + 1.959963984540054 * se, 7)]; });
      add({ type: "kv", items: [["Model", `${e.name} (${e.title})`], ["Number of obs", e.N.toLocaleString()], ["Expression", lin ? "Linear prediction" : e.link === "log" ? "Predicted number of events" : "Pr(" + e.depvar + ")"], [mode === "eyex" ? "ey/ex w.r.t." : "dy/dx w.r.t.", want.join(" ")], atm ? ["At", "means of the regressors"] : null].filter(Boolean) });
      add({ type: "table", head: ["", mode === "eyex" ? "ey/ex" : "dy/dx", "Delta-method std. err.", "z", "P>|z|", "[95% conf.", "interval]"], num: true, rows, note: want.some(x => x.includes("=")) && !atm ? "Category dummies (from i.) show the discrete change from the base level." : null }); out.msg = `${rows.length} ${mode === "eyex" ? "elasticit" + (rows.length > 1 ? "ies" : "y") : "marginal effect" + (rows.length > 1 ? "s" : "")}`; return true; }
    case "rvfplot": { const e = lastReg("to_rvfplot"); const yc = S.findCol(e.depvar); const yy = e.yvec && e.yvec.length === n ? e.yvec : yc ? numv(yc) : null; if (!yy) throw new Error(`Cannot find the outcome ${e.depvar}; run the model again right before to_predict.`); const Xd = design(e); const rows = e.use.map((i, q) => { const f = meDot(Xd[q], e.b); return [f, yy[i] - f]; }).filter(() => !e.fe || !e.fe.length);
      if (!rows.length) throw new Error("to_rvfplot works after to_reg without absorbed fixed effects."); add({ type: "chart", title: `Residuals against fitted values (${e.name})`, tab: { headers: ["Fitted values", "Residuals"], rows }, t: { type: "scatter", x: "Fitted values", ys: ["Residuals"], opts: { trend: false } } }); out.msg = `${rows.length} points`; return true; }
    case "estimates": { const [sub, ...restT] = stTokens(P.main); const s = (sub || "").toLowerCase(); const nm = stUnq(restT[0] || "");
      if (s === "store" || s === "sto") { const e = S.est.last; if (!e) throw new Error("Run a model first."); if (!nm) throw new Error("Name it: to_estimates store m1"); e.name = nm; out.msg = `last model stored as ${nm}`; return true; }
      if (s === "restore" || s === "res") { const e = S.est.models.find(x => x.name === nm); if (!e) throw new Error(`No model called ${nm}.`); S.est.last = e; out.msg = `${nm} is now the active model`; return true; }
      if (s === "dir" || s === "") { add({ type: "table", head: ["Name", "Command", "Dependent", "N"], rows: S.est.models.map(x => [x.name, x.cmd, x.depvar, x.N.toLocaleString()]) }); out.msg = `${S.est.models.length} models`; return true; }
      if (s === "table" || s === "tab") { const o2 = stRun("esttab", restT.join(" ") + (P.optRaw ? ", " + P.optRaw : ""), S, out.line); out.blocks.push(...o2.blocks); out.msg = o2.msg; return true; }
      throw new Error(`Syntax: ${ST_CMDS.estimates.syn}`); }
    case "scalar": { const s = P.main.trim(); if (!s || /^(list|dir)$/i.test(s)) { add({ type: "table", head: ["Scalar", "Value"], num: true, rows: Object.entries(S.est.scalars).map(([k, v]) => [k, stFmt(v, 10)]) }); out.msg = `${Object.keys(S.est.scalars).length} scalars`; return true; }
      const eq = (X.rest || s).match(/^(?:define\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/s); if (!eq) throw new Error(`Syntax: ${ST_CMDS.scalar.syn}`); const v = S.evalExpr(eq[2]); const first = v.find(x => typeof x === "number" && isFinite(x)); if (first == null) throw new Error(`${eq[2]} did not give a number.`);
      S.est.scalars[eq[1]] = first; add({ type: "text", text: `  ${eq[1]} = ${stFmt(first, 10)}` }); out.msg = `${eq[1]} = ${stFmt(first, 10)}`; return true; }

    // ── change data ──
    case "bysort": { const mm = X.rest.match(/^(.+?):\s*(?:to_)?([A-Za-z][A-Za-z0-9_]*)\s*(.*)$/s); if (!mm) throw new Error(`Syntax: ${ST_CMDS.bysort.syn}`); const head = mm[1]; const pm = head.match(/^([^(]*)(?:\(([^)]*)\))?\s*$/); const byv = vars(pm[1], { need: 1 }); const sv = pm[2] ? vars(pm[2]) : [];
      stRun("sort", [...byv, ...sv].join(" "), S, out.line); const sub = mm[2].toLowerCase(); let rest2 = mm[3]; const subCmd = ST_CMDS[sub] ? sub : ST_ALIAS[sub];
      if (["sum", "tabstat", "mean", "total", "proportion", "collapse"].includes(subCmd) && !/\bby\s*\(/.test(rest2) && !/\bover\s*\(/.test(rest2)) rest2 += (rest2.includes(",") ? " " : ", ") + (["mean", "total", "proportion"].includes(subCmd) ? `over(${byv[0]})` : `by(${byv.join(" ")})`);
      if (subCmd === "egen" && !/\bby\s*\(/.test(rest2)) rest2 += (rest2.includes(",") ? " " : ", ") + `by(${byv.join(" ")})`;
      S.byKeys = groupKeys(byv); try { const o2 = stRun(sub, rest2.trim(), S, out.line); out.blocks.push(...o2.blocks); out.msg = `by ${byv.join(" ")}: ${o2.msg || "done"}`; if (o2.changes) out.changes = true; } finally { S.byKeys = null; } out.changes = true; return true; }
    case "recode": { const pi = P.main.indexOf("("); if (pi < 0) throw new Error(`Syntax: ${ST_CMDS.recode.syn}`); const vs = vars(P.main.slice(0, pi), { need: 1 }); const rules = [...P.main.slice(pi).matchAll(/\(([^()]*)\)/g)].map(r => r[1]); if (!rules.length) throw new Error(`Syntax: ${ST_CMDS.recode.syn}`);
      const gens = O.gen && O.gen !== true ? stTokens(O.gen).map(stUnq) : O.generate && O.generate !== true ? stTokens(O.generate).map(stUnq) : null; if (gens && gens.length !== vs.length) throw new Error(`Give one new name per variable in gen(): ${vs.length} needed.`);
      const parsed = rules.map(r => { const eqI = r.lastIndexOf("="); if (eqI < 0) throw new Error(`Each rule needs "=": (${r})`); const lhs = r.slice(0, eqI).trim(), rhs = r.slice(eqI + 1).trim(); const to = rhs === "." || rhs === "" ? null : isFinite(+rhs) ? +rhs : stUnq(rhs);
        const tests = stTokens(lhs).map(tok => { const t = stUnq(tok); if (/^(else|\*)$/i.test(t)) return { else: true }; if (/^(missing|\.|miss|nonmissing)$/i.test(t)) return t.toLowerCase() === "nonmissing" ? { nonmiss: true } : { miss: true }; const rg = t.match(/^(min|-?[\d.]+)\s*\/\s*(max|-?[\d.]+)$/i); if (rg) return { lo: rg[1].toLowerCase() === "min" ? -Infinity : +rg[1], hi: rg[2].toLowerCase() === "max" ? Infinity : +rg[2] }; return { eq: t }; }); return { tests, to }; });
      let changed = 0; const m = sample(); vs.forEach((h, k) => { const src = S.cols[h]; const nv = src.map((v, i) => { if (!m[i]) return gens ? null : v; const blank = FXB(v); const x = fxNum(v); for (const r of parsed) { for (const t of r.tests) { const hit = t.else ? true : t.miss ? blank : t.nonmiss ? !blank : t.eq !== undefined ? (!blank && (isFinite(+t.eq) ? x === +t.eq : fxS(v).trim() === t.eq)) : (!blank && isFinite(x) && x >= t.lo && x <= t.hi); if (hit) { changed++; return r.to; } } } return v; }); S.setCol(gens ? gens[k] : h, nv); });
      out.msg = `${changed.toLocaleString()} value${changed === 1 ? "" : "s"} recoded${gens ? ` into ${gens.join(", ")}` : ""}`; out.changes = true; return true; }
    case "mvdecode": case "mvencode": { const vs = vars(P.main || "_all"); const mv = String(O.mv || "").trim(); if (!mv) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); let c = 0;
      if (cmd === "mvdecode") { const codes = stTokens(mv.replace(/\\/g, " ")).map(stUnq); vs.forEach(h => { S.setCol(h, S.cols[h].map(v => { if (!FXB(v) && codes.some(cd => isFinite(+cd) ? fxNum(v) === +cd : fxS(v).trim() === cd)) { c++; return null; } return v; })); }); }
      else { const code = isFinite(+stUnq(mv)) ? +stUnq(mv) : stUnq(mv); vs.forEach(h => { if (!O.override && S.cols[h].some(v => !FXB(v) && fxS(v).trim() === String(code))) throw new Error(`${h} already uses ${code}. Add the option override to use it anyway.`); S.setCol(h, S.cols[h].map(v => FXB(v) ? (c++, code) : v)); }); }
      out.msg = `${c.toLocaleString()} value${c === 1 ? "" : "s"} ${cmd === "mvdecode" ? "set to blank" : "filled"}`; out.changes = true; return true; }
    case "sample": { const k = fxNum(P.main.trim()); if (!isFinite(k) || k < 0) throw new Error(`Syntax: ${ST_CMDS.sample.syn}`); const rnd = O.seed ? stRng(+O.seed) : Math.random; const want = O.count ? Math.min(n, Math.round(k)) : Math.round(n * Math.min(100, k) / 100);
      const idx = Array.from({ length: n }, (_, i) => i); for (let i = 0; i < want; i++) { const j = i + Math.floor(rnd() * (n - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; } const keepS = new Set(idx.slice(0, want)); S.filterRows(i => keepS.has(i)); out.msg = `kept ${want.toLocaleString()} of ${n.toLocaleString()} rows${O.seed ? ` (seed ${O.seed})` : ""}`; out.changes = true; return true; }
    case "xpose": { if (n > 2000) throw new Error("to_xpose is limited to 2,000 rows."); const Hs = H().slice(); const nh = Array.from({ length: n }, (_, i) => `v${i + 1}`); const C2 = {}; nh.forEach((h, i) => { C2[h] = Hs.map(c => S.cols[c][i]); }); const H2 = O.varname ? ["_varname", ...nh] : nh; if (O.varname) C2._varname = Hs.slice();
      S.replaceAll(H2, C2); out.msg = `${Hs.length} rows × ${n} columns`; out.changes = true; return true; }
    case "tostring": { const vs = vars(P.main, { need: 1 }); const fm = O.format && O.format !== true ? String(O.format).match(/%\d*\.(\d+)[fg]/) : null; const gens = O.gen && O.gen !== true ? stTokens(O.gen).map(stUnq) : null; if (gens && gens.length !== vs.length) throw new Error(`Give one new name per variable in gen(): ${vs.length} needed.`); if (!gens && !O.replace) throw new Error("Add  , replace  to change the column, or  , gen(newname)  for a new one.");
      vs.forEach((h, k) => S.setCol(gens ? gens[k] : h, S.cols[h].map(v => { if (FXB(v)) return ""; const x = fxNum(v); return fm && isFinite(x) ? x.toFixed(+fm[1]) : fxS(v); }))); out.msg = `${vs.join(", ")} as text`; out.changes = true; return true; }
    case "decode": { const h = vars(P.main, { need: 1, max: 1 })[0]; const nm = O.gen && O.gen !== true ? stUnq(O.gen) : O.generate && O.generate !== true ? stUnq(O.generate) : null; if (!nm) throw new Error("Name the new column: to_decode region_id, gen(region_name)"); const lab = S.est.labels && S.est.labels[h];
      if (!lab) throw new Error(`${h} has no labels. to_decode reads the labels made by to_encode earlier in the same script.`); S.setCol(nm, S.cols[h].map(v => { const x = fxNum(v); return isFinite(x) && lab[x - 1] != null ? lab[x - 1] : null; })); out.msg = `${nm}: labels of ${h}`; out.changes = true; return true; }
    case "order": { const vs = vars(P.main, { need: 1 }); const others = H().filter(h => !vs.includes(h)); let full; const af = optVar(O.after), bf = optVar(O.before);
      if (O.last) full = [...others, ...vs]; else if (af || bf) { const anchor = af || bf; const q = others.indexOf(anchor); if (q < 0) throw new Error(`${anchor} is one of the columns being moved.`); full = [...others.slice(0, af ? q + 1 : q), ...vs, ...others.slice(af ? q + 1 : q)]; } else full = [...vs, ...others];
      S.order(full); out.msg = `order: ${full.slice(0, 8).join(" ")}${full.length > 8 ? " …" : ""}`; out.changes = true; return true; }
    case "merge": case "append": { const um = X.rest.match(/\busing\s+("[^"]*"|'[^']*'|\[[^\]]*\]|[^\s,]+)/i); if (!um) throw new Error(`Syntax: ${ST_CMDS[cmd].syn}`); const D = stDS(S, um[1]); const DH = D.headers; const dcol = (nm) => { const j = DH.findIndex(h => h.toLowerCase() === nm.toLowerCase()); if (j < 0) throw new Error(`"${D.name}" has no column called ${nm}.`); return j; };
      const Hs = H().slice(); const C = {}; Hs.forEach(h => { C[h] = S.cols[h].slice(); });
      if (cmd === "append") { const add2 = DH.filter(h => !Hs.some(x => x.toLowerCase() === h.toLowerCase())); const H2 = [...Hs, ...add2]; add2.forEach(h => { C[h] = new Array(n).fill(null); }); const src = O.gen && O.gen !== true ? stUnq(O.gen) : O.generate && O.generate !== true ? stUnq(O.generate) : null; if (src) { C[src] = new Array(n).fill(0); H2.push(src); }
        D.rows.forEach(r => { H2.forEach(h => { if (h === src) { C[h].push(1); return; } const j = DH.findIndex(x => x.toLowerCase() === h.toLowerCase()); C[h].push(j >= 0 ? fxCell(r[j]) : null); }); }); S.replaceAll(H2, C); out.msg = `appended ${D.rows.length.toLocaleString()} rows from "${D.name}" (${(n + D.rows.length).toLocaleString()} rows now)`; out.changes = true; return true; }
      const pm2 = X.rest.slice(0, um.index).trim().match(/^(1:1|m:1|1:m|m:m)\s+(.+)$/i); if (!pm2) throw new Error(`Say the kind of merge and the key columns: ${ST_CMDS.merge.syn}`); const kind = pm2[1].toLowerCase(); if (kind === "m:m") throw new Error("m:m merges are almost always a mistake. Use 1:1, m:1 or 1:m.");
      const keys = vars(pm2[2], { need: 1 }); const dk = keys.map(dcol); const keyM = (i) => keys.map(h => fxKey(S.cols[h][i])).join("\u0001"); const keyU = (r) => dk.map(j => fxKey(fxCell(r[j]))).join("\u0001");
      const um2 = new Map(); D.rows.forEach((r, q) => { const k = keyU(r); if (!um2.has(k)) um2.set(k, []); um2.get(k).push(q); }); if (kind[2] === "1" && [...um2.values()].some(a => a.length > 1)) throw new Error(`${keys.join(" ")} do not identify the rows of "${D.name}" uniquely, so this cannot be ${kind}. Try 1:m.`);
      if (kind[0] === "1") { const seen = new Set(); for (let i = 0; i < n; i++) { const k = keyM(i); if (seen.has(k)) throw new Error(`${keys.join(" ")} repeat in this dataset, so this cannot be ${kind}. Try m:1.`); seen.add(k); } }
      const newCols = DH.map((h, j) => [h, j]).filter(([h, j]) => !dk.includes(j) && !Hs.some(x => x.toLowerCase() === h.toLowerCase())); const H2 = [...Hs, ...newCols.map(([h]) => h)]; const out2 = {}; H2.forEach(h => { out2[h] = []; }); const mg = []; const usedU = new Set();
      const keepOpt = String(O.keep || "master using match").toLowerCase(); const keepK = { 1: /master|1/.test(keepOpt), 2: /using|2/.test(keepOpt), 3: /match|3/.test(keepOpt) };
      const push = (i, q, code) => { if (!keepK[code]) return; Hs.forEach(h => { let v = i != null ? C[h][i] : null; if (i == null && q != null) { const j = keys.indexOf(h) >= 0 ? dk[keys.indexOf(h)] : DH.findIndex(x => x.toLowerCase() === h.toLowerCase()); v = j >= 0 ? fxCell(D.rows[q][j]) : null; } out2[h].push(v); }); newCols.forEach(([h, j]) => out2[h].push(q != null ? fxCell(D.rows[q][j]) : null)); mg.push(code); };
      let c1 = 0, c3 = 0; for (let i = 0; i < n; i++) { const hit = um2.get(keyM(i)); if (hit) { hit.forEach(q => { usedU.add(q); push(i, q, 3); c3++; }); } else { push(i, null, 1); c1++; } } let c2 = 0; D.rows.forEach((_, q) => { if (!usedU.has(q)) { push(null, q, 2); c2++; } });
      if (!O.nogenerate && !O.nogen) { H2.push("_merge"); out2._merge = mg; } S.replaceAll(H2, out2);
      add({ type: "table", head: ["Result", "Rows"], num: true, rows: [["Not matched", (c1 + c2).toLocaleString()], ["   from master (_merge==1)", c1.toLocaleString()], ["   from using (_merge==2)", c2.toLocaleString()], ["Matched (_merge==3)", c3.toLocaleString()]], note: keepOpt !== "master using match" ? `Kept: ${O.keep}` : null }); out.msg = `${kind} merge with "${D.name}": ${c3.toLocaleString()} matched`; out.changes = true; return true; }

    // ── graphs ──
    case "tsline": case "xtline": { const t = S.time; if (!t) throw new Error(`to_${cmd} needs a time variable. Add  to_tsset year  (or  to_xtset country year) above it.`); const ys = vars(P.main, { need: 1 });
      if (cmd === "xtline") { const u = S.unit; if (!u) throw new Error("to_xtline needs the panel unit. Add  to_xtset country year  above it."); chart(`${ys[0]} over ${t} by ${u}`, [t, ys[0], u], { type: "line", x: t, ys: [ys[0]], group: u, agg: "mean", opts: {} }); return true; }
      chart(`${ys.join(", ")} over ${t}`, [t, ...ys], { type: "line", x: t, ys, agg: "mean", opts: {} }); if (S.unit) add({ type: "note", text: `Several ${S.unit} values share each ${t}; the line shows their mean. Use to_xtline for one line per ${S.unit}.` }); return true; }
    case "area": { const vs = vars(P.main, { need: 2 }); const x = vs[vs.length - 1], ys = vs.slice(0, -1); chart(`${ys.join(", ")} over ${x}`, [x, ...ys], { type: "area", x, ys, agg: O.stat || "mean", opts: {} }); return true; }
    case "dot": { const ys = P.main ? vars(P.main) : []; const over = O.over ? vars(O.over, { max: 1 })[0] : ""; if (!over) throw new Error(`Say which groups: ${ST_CMDS.dot.syn}`); chart(`${O.stat || "mean"} of ${ys.join(", ") || "rows"} by ${over}`, [over, ...ys], { type: "lollipop", x: over, ys, agg: O.stat || (ys.length ? "mean" : "count"), opts: {} }); return true; }
    case "vioplot": { const vs = vars(P.main, { need: 1 }); const g = optVar(O.over) || optVar(O.by); chart(`Violin plot of ${vs.join(", ")}${g ? ` by ${g}` : ""}`, [...new Set([...vs, g].filter(Boolean))], { type: "violin", ys: g ? vs.slice(0, 1) : vs, group: g, opts: {} }); return true; }
    case "binscatter": { const [y, x] = vars(P.main, { need: 2, max: 2 }); const nq = O.nq ? Math.max(2, Math.min(200, +O.nq)) : 20; const m = sample(); const yv = numv(y), xv = numv(x); const pts = []; for (let i = 0; i < n; i++) if (m[i] && isFinite(yv[i]) && isFinite(xv[i])) pts.push([xv[i], yv[i]]); if (pts.length < nq) throw new Error(`Only ${pts.length} complete rows; use fewer bins with nq().`);
      pts.sort((a, b) => a[0] - b[0]); const rows = []; for (let b = 0; b < nq; b++) { const lo = Math.floor(b * pts.length / nq), hi = Math.floor((b + 1) * pts.length / nq); if (hi <= lo) continue; const seg = pts.slice(lo, hi); rows.push([seg.reduce((s, p) => s + p[0], 0) / seg.length, seg.reduce((s, p) => s + p[1], 0) / seg.length]); }
      add({ type: "chart", title: `${y} against ${x} (${rows.length} equal-sized bins)`, tab: { headers: [x, y], rows }, t: { type: "scatter", x, ys: [y], opts: { trend: true } } }); out.msg = `${rows.length} bins from ${pts.length.toLocaleString()} rows`; return true; }
    case "bootstrap": { let d0 = 0, q0 = null, ci = -1; const R0 = X.rest; for (let i = 0; i < R0.length; i++) { const c = R0[i]; if (q0) { if (c === q0) q0 = null; continue; } if (c === '"' || c === "'") { q0 = c; continue; } if ("([{".includes(c)) d0++; else if (")]}".includes(c)) d0--; else if (c === ":" && d0 === 0) { ci = i; break; } }
      if (ci < 0) throw new Error(`Put the command after a colon: ${ST_CMDS.bootstrap.syn}`); const head = stParse(R0.slice(0, ci)); const HO = head.opts; const body = R0.slice(ci + 1).split(";").map(x => x.trim()).filter(Boolean).map(x => /^to_/i.test(x) ? x : `to_${x}`);
      if (!body.length) throw new Error("Give the command to bootstrap after the colon."); if (body.some(x => /^to_bootstrap/i.test(x))) throw new Error("to_bootstrap cannot contain another to_bootstrap.");
      const reps = Math.max(2, Math.min(5000, Math.round(+(HO.reps || HO.r || 50)))); const rnd = HO.seed != null && HO.seed !== true ? stRng(+HO.seed) : Math.random; const clv = HO.cluster && HO.cluster !== true ? vars(HO.cluster, { max: 1 })[0] : "";
      const want = [...String(head.main || "").matchAll(/_b\[([^\]]+)\]/g)].map(x => x[1].trim()).concat(stTokens(String(head.main || "").replace(/_b\[[^\]]+\]/g, "")).map(stUnq).filter(Boolean));
      const Hs = H().slice(); const rowsAll = Array.from({ length: n }, (_, i) => Hs.map(h => S.cols[h][i])); const u = S.unit, t = S.time; const BU = "__bs_unit";
      const runOn = (headers, rows, unitCol) => { const sc = [unitCol ? `to_xtset [${unitCol}]${t ? ` [${t}]` : ""}` : t ? `to_tsset [${t}]` : "", ...body].filter(Boolean).join("\n"); const r = fxRun({ headers, rows }, sc, { datasets: S.datasets }); const bad = r.results.find(x => !x.ok); if (bad) throw new Error(bad.error); const e = r.est && r.est.last; if (!e) throw new Error("The commands after the colon must end with a model (to_reg, to_ivreg, to_logit, ...)."); return e; };
      const e0 = runOn(Hs, rowsAll, u || ""); const names = want.length ? want : e0.names.slice(); names.forEach(nm => { if (!e0.names.includes(nm)) throw new Error(`${nm} is not in the model (${e0.names.join(", ")}).`); }); const b0 = names.map(nm => e0.b[e0.names.indexOf(nm)]);
      const keyOf = clv ? S.cols[clv].map(fxKey) : null; const groupsB = (() => { if (!clv) return null; const gm = new Map(); for (let i = 0; i < n; i++) { const k = keyOf[i]; if (k === "") continue; if (!gm.has(k)) gm.set(k, []); gm.get(k).push(i); } return [...gm.values()]; })();
      if (clv && groupsB.length < 2) throw new Error(`${clv} has fewer than two groups.`); const draws = []; let fails = 0, r = 0; const HB = [...Hs, BU]; const uj = u ? Hs.indexOf(u) : -1;
      out.progress = () => `bootstrap replication ${r} of ${reps}`;
      out.iter = () => { const rows = []; if (groupsB) { for (let g = 0; g < groupsB.length; g++) { const G = groupsB[Math.floor(rnd() * groupsB.length)]; G.forEach(i => rows.push([...rowsAll[i], `${g}|${uj >= 0 ? fxKey(rowsAll[i][uj]) : ""}`])); } }
        else for (let q = 0; q < n; q++) { const i = Math.floor(rnd() * n); rows.push([...rowsAll[i], uj >= 0 ? `${q}|${fxKey(rowsAll[i][uj])}` : `${q}`]); }
        try { const e = runOn(HB, rows, groupsB || u ? BU : ""); const v = names.map(nm => { const j = e.names.indexOf(nm); return j < 0 ? NaN : e.b[j]; }); if (v.every(isFinite)) draws.push(v); else fails++; } catch (er) { fails++; }
        r++; return r < reps; };
      out.finish = () => { const B = draws.length; if (B < 2) throw new Error(`Only ${B} of ${reps} replications worked. Check the commands or use more data.`); const mean = names.map((_, j) => draws.reduce((a, d) => a + d[j], 0) / B);
        const V = names.map((_, a) => names.map((_, c) => draws.reduce((s2, d) => s2 + (d[a] - mean[a]) * (d[c] - mean[c]), 0) / (B - 1))); const se = V.map((row, j) => Math.sqrt(row[j]));
        const pct = (j, f) => { const xs = draws.map(d => d[j]).sort((p, q) => p - q); const hh = (B - 1) * f, lo = Math.floor(hh); return xs[lo] + (xs[Math.min(lo + 1, B - 1)] - xs[lo]) * (hh - lo); };
        kv([["Command", body.join(" ; ")], ["Replications", `${B.toLocaleString()}${fails ? ` (${fails} failed)` : ""}`], ["Resampling", clv ? `${groupsB.length.toLocaleString()} clusters of ${clv}` : "rows"], ["Seed", HO.seed != null && HO.seed !== true ? String(HO.seed) : "random"], ["Number of obs", e0.N.toLocaleString()]]);
        add({ type: "table", caption: e0.depvar, head: ["", "Observed coef.", "Bootstrap std. err.", "z", "P>|z|", "[95% conf. interval] normal", "", "[95%] percentile", ""], num: true, rows: names.map((nm, j) => { const z = b0[j] / se[j]; const p = 2 * (1 - meNormCdf(Math.abs(z))); return [nm, stFmt(b0[j], 7) + stStars(p), stFmt(se[j], 7), stFmt(z, 4), stP(p), stFmt(b0[j] - 1.959963984540054 * se[j], 7), stFmt(b0[j] + 1.959963984540054 * se[j], 7), stFmt(pct(j, .025), 7), stFmt(pct(j, .975), 7)]; }) });
        add({ type: "note", text: `Observed coefficients come from the full data; standard errors are the spread of ${B} bootstrap estimates.${!clv && (u || /\b[LDF]\d*\./.test(body.join(" "))) ? ` Rows were resampled one by one; for panel data add cluster(${u || "id"}) so each unit's years stay together.` : ""}` });
        store({ cmd: "bootstrap", title: `Bootstrap of ${e0.title}`, depvar: e0.depvar, names, b: b0, se, V, df: Infinity, N: e0.N, r2: e0.r2, isZ: true, n0: -1, link: "boot" }); };
      out.msg = `${reps} replications`; return true; }
    default: return false;
  }
};
// ══════════════════════════════════════════════
// CELL FORMULAS (Excel style) for the dataset table
// A1 references: B3, $B$3, B$3, ranges B2:B10, A1:C5, whole column B:B, whole row 3:3.
// Letters are column positions (A = first column), numbers are data rows (1 = first data row, as shown in the table).
// Column names still work and mean "this row" (gdp, [GDP growth]); aggregate functions over ranges work like Excel.
// Results that fail show Excel error values: #DIV/0!, #VALUE!, #REF!, #NAME?, #N/A, #NUM!, #CIRC!
// ══════════════════════════════════════════════
const CE_ERRS = ["#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#N/A", "#NUM!", "#NULL!", "#CIRC!", "#CALC!"];
const ceIsErr = (v) => typeof v === "string" && CE_ERRS.includes(v.trim());
const ceColIdx = (L) => { let n = 0; for (const c of L.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
const ceColName = (j) => { let s = ""; j++; while (j > 0) { const m = (j - 1) % 26; s = String.fromCharCode(65 + m) + s; j = Math.floor((j - 1) / 26); } return s; };
const ceAddr = (i, j) => `${ceColName(j)}${i + 1}`;
// one reference token: $A$1 / A1 / A:A / 3:3 / A1:B5
const CE_REF = /(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Z]{1,3})(\$?)(\d{1,7}))?|(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})|(\$?)(\d{1,7}):(\$?)(\d{1,7})/y;
// walk an expression, calling fn(match, index) for each A1 reference outside quotes and [brackets]; returns the rebuilt string
const ceScan = (expr, H, fn) => { let out = "", i = 0, q = null; const isCol = (t) => H.some(h => h === t);
  while (i < expr.length) { const c = expr[i];
    if (q) { out += c; if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; } if (c === "[") { q = "]"; out += c; i++; continue; }
    const prev = expr[i - 1] || ""; if (/[A-Za-z0-9_.]/.test(prev)) { out += c; i++; continue; }
    CE_REF.lastIndex = i; const m = CE_REF.exec(expr);
    if (m && m.index === i) { const tok = m[0]; const next = expr[i + tok.length] || "";
      if (!/[A-Za-z0-9_.(]/.test(next) && !isCol(tok)) { out += fn(m, tok); i += tok.length; continue; } }
    out += c; i++; }
  return out; };
// parse a reference match into {r0,c0,r1,c1, abs flags}
const ceRef = (m) => { if (m[2]) { const r = { c0: ceColIdx(m[2]), r0: +m[4] - 1, ac0: !!m[1], ar0: !!m[3] }; if (m[6]) Object.assign(r, { c1: ceColIdx(m[6]), r1: +m[8] - 1, ac1: !!m[5], ar1: !!m[7] }); else Object.assign(r, { c1: r.c0, r1: r.r0, ac1: r.ac0, ar1: r.ar0, single: true }); return r; }
  if (m[10]) return { c0: ceColIdx(m[10]), c1: ceColIdx(m[12]), r0: 0, r1: Infinity, ac0: !!m[9], ac1: !!m[11], wholeCol: true };
  return { r0: +m[14] - 1, r1: +m[16] - 1, c0: 0, c1: Infinity, ar0: !!m[13], ar1: !!m[15], wholeRow: true }; };
const ceRefStr = (r) => { const c = (j, a) => (a ? "$" : "") + ceColName(j), w = (i, a) => (a ? "$" : "") + (i + 1);
  if (r.wholeCol) return `${c(r.c0, r.ac0)}:${c(r.c1, r.ac1)}`; if (r.wholeRow) return `${w(r.r0, r.ar0)}:${w(r.r1, r.ar1)}`;
  return r.single ? c(r.c0, r.ac0) + w(r.r0, r.ar0) : `${c(r.c0, r.ac0) + w(r.r0, r.ar0)}:${c(r.c1, r.ac1) + w(r.r1, r.ar1)}`; };
// shift relative references by dr rows and dc columns (Excel copy / fill); references pushed off the sheet become #REF!
const ceShift = (formula, dr, dc, H) => ceScan(formula, H, (m) => { const r = ceRef(m);
  if (!r.wholeRow) { if (!r.ac0) r.c0 += dc; if (!r.ac1) r.c1 += dc; } if (!r.wholeCol) { if (!r.ar0) r.r0 += dr; if (!r.ar1) r.r1 += dr; }
  if (r.c0 < 0 || r.c1 < 0 || r.r0 < 0 || r.r1 < 0) return "#REF!"; return ceRefStr(r); });
// cells a formula reads (for ordering and circular-reference checks); ranges are capped
const ceDeps = (formula, H, nR) => { const out = []; ceScan(formula, H, (m, tok) => { const r = ceRef(m); const r1 = Math.min(r.r1, nR - 1), c1 = Math.min(r.c1, H.length - 1);
  if ((r1 - r.r0 + 1) * (c1 - r.c0 + 1) <= 5000) for (let i = r.r0; i <= r1; i++) for (let j = r.c0; j <= c1; j++) out.push(i + ":" + j); return tok; }); return out; };
const CE_AGG = { SUM: "sum", AVERAGE: "mean", AVG: "mean", MIN: "min", MAX: "max", COUNT: "count", COUNTA: "counta", COUNTBLANK: "blank", MEDIAN: "median", PRODUCT: "product", STDEV: "sd", "STDEV.S": "sd", "STDEV.P": "sdp", VAR: "var", "VAR.S": "var", "VAR.P": "varp",
  total_across: "sum", average_across: "mean", smallest_across: "min", largest_across: "max", count_across: "count", median_across: "median", product_across: "product", spread_across: "sd" };
const ceAgg = (how, vals) => { const er = vals.find(ceIsErr); if (er && !["count", "counta", "blank"].includes(how)) return er.trim(); if (er) vals = vals.filter(v => !ceIsErr(v) || how === "counta"); const nums = vals.map(fxNum).filter(isFinite); const N = nums.length; const mu = N ? nums.reduce((a, b) => a + b, 0) / N : NaN; const ss = nums.reduce((a, b) => a + (b - mu) ** 2, 0);
  switch (how) { case "sum": return nums.reduce((a, b) => a + b, 0); case "mean": return N ? mu : "#DIV/0!"; case "min": return N ? Math.min(...nums) : 0; case "max": return N ? Math.max(...nums) : 0; case "count": return N;
    case "counta": return vals.filter(v => !FXB(v)).length; case "blank": return vals.filter(v => FXB(v)).length; case "median": { if (!N) return "#NUM!"; const s = nums.slice().sort((a, b) => a - b); const h = (N - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; }
    case "product": return N ? nums.reduce((a, b) => a * b, 1) : 0; case "sd": return N > 1 ? Math.sqrt(ss / (N - 1)) : "#DIV/0!"; case "sdp": return N ? Math.sqrt(ss / N) : "#DIV/0!"; case "var": return N > 1 ? ss / (N - 1) : "#DIV/0!"; case "varp": return N ? ss / N : "#DIV/0!"; default: return NaN; } };
// Evaluate one cell formula. R holds current values (strings). fx gives other cells' formulas (for FORMULATEXT).
// Returns { v, err }: err is the Excel error a NaN result should show (taken from a referenced error cell or NA()).
// find NAME( ... ) with balanced brackets; fn(args) gives the replacement text. Innermost calls are replaced first.
const ceCall = (expr, name, fn) => { const re = new RegExp(`\\b${name}\\s*\\(`, "gi"); for (let guard = 0; guard < 50; guard++) { re.lastIndex = 0; let m, last = null; while ((m = re.exec(expr))) { let inStr = false; for (let k = 0; k < m.index; k++) if (expr[k] === '"') inStr = !inStr; if (!inStr) last = m; } if (!last) return expr;
    const start = last.index, open = start + last[0].length - 1; let d = 0, q = null, k = open; const args = []; let cur = "";
    for (; k < expr.length; k++) { const c = expr[k]; if (q) { cur += c; if (c === q) q = null; continue; } if (c === '"') { q = c; cur += c; continue; } if (c === "(") { if (d++ > 0) cur += c; continue; } if (c === ")") { if (--d === 0) break; cur += c; continue; } if (c === "," && d === 1) { args.push(cur.trim()); cur = ""; continue; } cur += c; }
    if (k >= expr.length) throw new Error(`${name}( is missing its closing bracket.`); if (cur.trim() || args.length) args.push(cur.trim()); expr = expr.slice(0, start) + fn(args) + expr.slice(k + 1); } return expr; };
// $ cycling like Excel's F4: A1 → $A$1 → A$1 → $A1 → A1 (ranges change both ends). Returns the new text and caret.
const ceCycleRef = (text, caret, H = []) => { const body = String(text); const re = /(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Z]{1,3})(\$?)(\d{1,7}))?/g; let m, hit = null; const qpos = [];
  for (let k = 0; k < body.length; k++) if (body[k] === '"') qpos.push(k); const quoted = (p) => qpos.filter(x => x < p).length % 2 === 1;
  while ((m = re.exec(body))) { const a = m.index, b = a + m[0].length; const prev = body[a - 1] || "", next = body[b] || ""; if (/[A-Za-z0-9_.]/.test(prev) || /[A-Za-z0-9_(]/.test(next) || quoted(a) || H.includes(m[0].replace(/\$/g, ""))) continue; if (caret >= a && caret <= b) { hit = { m, a, b }; break; } if (b <= caret) hit = { m, a, b }; }
  if (!hit) return null; const { m: mm, a, b } = hit; const state = (c, r) => (c ? 1 : 0) * 2 + (r ? 1 : 0); const nextOf = { 0: [1, 1], 3: [0, 1], 1: [1, 0], 2: [0, 0] }; const [nc, nr] = nextOf[state(!!mm[1], !!mm[3])];
  const one = (col, row) => `${nc ? "$" : ""}${col}${nr ? "$" : ""}${row}`; const rep = mm[6] ? `${one(mm[2], mm[4])}:${one(mm[6], mm[8])}` : one(mm[2], mm[4]); return { text: body.slice(0, a) + rep + body.slice(b), caret: a + rep.length }; };
// ADDRESS(row, col, abs_num): 1 = $A$1, 2 = A$1, 3 = $A1, 4 = A1
const ceAddress = (r, c, absN = 1) => { const a = +absN || 1; return `${a === 1 || a === 3 ? "$" : ""}${ceColName(c - 1)}${a === 1 || a === 2 ? "$" : ""}${r}`; };
const ceEval = (formula, H, R, i, opts = {}) => { let expr = String(formula).replace(/^=\s*/, ""); const nR = R.length; let seen = null;
  // ROW(), COLUMN(), ROW(B5), COLUMN(C1), ROWS(A1:A9), COLUMNS(A1:C1), ADDRESS(), INDIRECT(): worked out first, from the cell this formula is in
  if (/\b(ROW|COLUMN|ROWS|COLUMNS|ADDRESS|INDIRECT)\s*\(/i.test(expr)) { const refOf = (t) => { CE_REF.lastIndex = 0; const m = CE_REF.exec(String(t).trim()); if (!m || m[0] !== String(t).trim()) throw new Error("#VALUE!"); return ceRef(m); };
    const sub = (a) => { const r = ceEval("=" + a, H, R, i, opts); if (r.err) throw new Error(r.err); return r.v; };
    expr = ceCall(expr, "ROWS", (A) => { const r = refOf(A[0]); return String((r.r1 ?? r.r0) - r.r0 + 1); }); expr = ceCall(expr, "COLUMNS", (A) => { const r = refOf(A[0]); return String((r.c1 ?? r.c0) - r.c0 + 1); });
    expr = ceCall(expr, "ROW", (A) => A.length && A[0] ? String(refOf(A[0]).r0 + 1) : String(i + 1)); expr = ceCall(expr, "COLUMN", (A) => A.length && A[0] ? String(refOf(A[0]).c0 + 1) : String((opts.col ?? 0) + 1));
    expr = ceCall(expr, "ADDRESS", (A) => { if (A.length < 2) throw new Error("ADDRESS needs a row and a column number, for example ADDRESS(2, 3)."); return JSON.stringify(ceAddress(fxNum(sub(A[0])), fxNum(sub(A[1])), A[2] ? fxNum(sub(A[2])) : 1)); });
    expr = ceCall(expr, "INDIRECT", (A) => { const t = String(sub(A[0]) ?? "").trim().replace(/^'?[^!]*'?!/, ""); CE_REF.lastIndex = 0; const m = CE_REF.exec(t); if (!m || m[0] !== t) throw new Error("#REF!"); return t; }); }
  const val = (r, c) => { if (r < 0 || r >= nR || c < 0 || c >= H.length) throw new Error("#REF!"); const v = (R[r] || [])[c]; if (ceIsErr(v)) { seen = seen || v.trim(); return v.trim(); } return fxCell(v); };
  const cellsOf = (r) => { const r1 = Math.min(r.r1, nR - 1), c1 = Math.min(r.c1, H.length - 1); if (r.c0 >= H.length || r.r0 >= nR || r.c0 < 0 || r.r0 < 0) throw new Error("#REF!"); if ((r1 - r.r0 + 1) * (c1 - r.c0 + 1) > 2e6) throw new Error("#NUM!"); const o = []; for (let a = r.r0; a <= r1; a++) for (let b = r.c0; b <= c1; b++) o.push(val(a, b)); return o; };
  // FORMULATEXT(B3)
  expr = expr.replace(/\bFORMULATEXT\(\s*(\$?[A-Z]{1,3}\$?\d{1,7})\s*\)/g, (_, ref) => { CE_REF.lastIndex = 0; const m = CE_REF.exec(ref); const r = ceRef(m); const f = opts.fx && (opts.fx[`r:${r.r0}:${H[r.c0]}`] || opts.fx[`c:${H[r.c0]}`]); return JSON.stringify(f || "#N/A"); });
  // ISERROR / ISERR / ISNA / ERROR.TYPE / NA() handled after evaluation through the error strings
  expr = expr.replace(/\bNA\(\s*\)/g, () => { seen = seen || "#N/A"; return "(0/0)"; });
  // aggregates whose arguments are all ranges, cells or numbers are worked out here, like Excel
  const aggRe = /\b(SUM|AVERAGE|AVG|MIN|MAX|COUNTA|COUNTBLANK|COUNT|MEDIAN|PRODUCT|STDEV\.S|STDEV\.P|STDEV|VAR\.S|VAR\.P|VAR|total_across|average_across|smallest_across|largest_across|count_across|median_across|product_across|spread_across)\s*\(([^()]*)\)/gi;
  let guard = 0; while (guard++ < 50) { let hit = false; expr = expr.replace(aggRe, (all, fn, args) => { const parts = args.split(",").map(a => a.trim()).filter(Boolean); const vals = []; let ok = parts.length > 0;
      for (const p of parts) { CE_REF.lastIndex = 0; const m = /^(\$?[A-Z]{1,3}\$?\d{1,7}(:\$?[A-Z]{1,3}\$?\d{1,7})?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d{1,7}:\$?\d{1,7})$/.test(p) && !H.includes(p) ? CE_REF.exec(p) : null;
        if (m && m[0] === p) vals.push(...cellsOf(ceRef(m))); else if (/^-?[\d.]+(e[-+]?\d+)?$/i.test(p)) vals.push(+p); else if (/^"[^"]*"$/.test(p)) vals.push(p.slice(1, -1)); else { ok = false; break; } }
      if (!ok) return all; hit = true; const key = fn.toUpperCase(); const how = CE_AGG[key] || CE_AGG[fn.toLowerCase()]; const r = ceAgg(how, vals); if (typeof r === "string") { seen = seen || r; return "(0/0)"; } return `(${r})`; });
    if (!hit) break; }
  // remaining references: one cell → its value, a range → a list the column functions can read
  const extra = {}; let k = 0; let maxLen = 1;
  expr = ceScan(expr, H, (m) => { const r = ceRef(m); if (r.single) { const v = val(r.r0, r.c0); const nm = `__c${k++}`; extra[nm] = { v, single: true }; return nm; }
    const vs = cellsOf(r); const nm = `__r${k++}`; extra[nm] = { vs }; maxLen = Math.max(maxLen, vs.length); return nm; });
  // does it name columns (this-row values)? then work over the whole table, else in one-row mode
  const ast = fxParse(fxWrapCols(expr, H)); const usesCols = (() => { let u = false; const walk = (a) => { if (!a || typeof a !== "object") return; if ((a.t === "col" || a.t === "strcol") && !/^__[cr]\d+$/.test(a.v) && H.some(h => h.toLowerCase() === String(a.v).toLowerCase())) u = true; Object.values(a).forEach(x => Array.isArray(x) ? x.forEach(walk) : walk(x)); }; walk(ast); return u; })();
  const n = usesCols ? Math.max(nR, maxLen) : maxLen; const pos = usesCols ? i : 0; const cols = {};
  if (usesCols) H.forEach((h, j) => { const a = new Array(n); for (let r = 0; r < n; r++) a[r] = r < nR ? (R[r] || [])[j] : null; cols[h] = a; });
  const run = (zero) => { Object.entries(extra).forEach(([nm, e]) => { const sv = zero && (e.v == null || e.v === "") ? 0 : e.v; cols[nm] = e.single ? new Array(n).fill(sv) : Array.from({ length: n }, (_, r) => r < e.vs.length ? e.vs[r] : null); });
    return fxEval(ast, { cols, n, groups: [Array.from({ length: n }, (_, r) => r)], datasets: opts.datasets || {} })[pos]; };
  let v = run(false);
  // like Excel: an empty cell counts as 0 in arithmetic (=B1+1 with B1 empty gives 1), and text in arithmetic gives #VALUE!
  if ((v == null || (typeof v === "number" && isNaN(v))) && !seen && /[-+*/^]/.test(expr.replace(/"[^"]*"/g, ""))) { const singles = Object.values(extra).filter(e => e.single);
    if (singles.some(e => e.v == null || e.v === "")) { const v2 = run(true); if (v2 != null && !(typeof v2 === "number" && isNaN(v2))) v = v2; }
    if ((v == null || (typeof v === "number" && isNaN(v))) && singles.some(e => typeof e.v === "string" && e.v !== "" && !isFinite(+e.v))) seen = "#VALUE!"; }
  return { v, err: seen }; };
// Excel-like display of a result: numbers trimmed, NaN → error value
const ceShow = (v, formula, err) => { if (typeof v === "number") { if (isFinite(v)) return String(+v.toPrecision(12)); return err || (/\//.test(String(formula || "")) ? "#DIV/0!" : "#NUM!"); } if (v == null) return /look_up|XLOOKUP|MATCH|VLOOKUP/i.test(String(formula || "")) ? "#N/A" : ""; return String(v); };
const ceErrOf = (msg) => { const m = String(msg || ""); if (CE_ERRS.includes(m)) return m; if (/No column called|Unknown function|not available|looks like (?:an Excel cell|a cell reference)/i.test(m)) return "#NAME?"; if (/does not exist|out of range/i.test(m)) return "#REF!"; return "#VALUE!"; };
// Excel fill: from a source block, produce values for the next k cells along a line (Excel's AutoFill rules)
// vals: source values (strings) in order; returns array of k new values. Numbers: linear trend if 2+ numbers, else copy;
// text ending in a number (Item 3) counts up; dates step by the source step (or 1 day); weekday and month names continue.
const CE_LISTS = [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], ["Q1", "Q2", "Q3", "Q4"]];
const ceSeries = (vals, k, copy) => { const n = vals.length; const out = []; if (!n) return out; if (copy) { for (let t = 0; t < k; t++) out.push(vals[t % n]); return out; }
  const nums = vals.map(v => { const s = String(v ?? "").trim(); return /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?$/i.test(s) ? +s.replace(/,/g, "") : NaN; });
  if (n >= 2 && nums.every(isFinite)) { const xs = nums.map((_, q) => q), mx = (n - 1) / 2, my = nums.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0; xs.forEach((x, q) => { sxy += (x - mx) * (nums[q] - my); sxx += (x - mx) ** 2; }); const b = sxy / sxx, a = my - b * mx;
    const dec = Math.max(...vals.map(v => ((String(v).split(".")[1]) || "").length)); for (let t = 0; t < k; t++) { const y = a + b * (n + t); out.push(String(+y.toFixed(Math.min(10, dec + 2)))); } return out; }
  const days = vals.map(v => /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? fxDate(v) : NaN);
  if (days.every(isFinite)) { const st = n >= 2 ? days[n - 1] - days[n - 2] : 1; for (let t = 1; t <= k; t++) out.push(fxISO(days[n - 1] + st * t)); return out; }
  const last = String(vals[n - 1] ?? ""); const L = CE_LISTS.find(l => vals.every(v => l.some(x => x.toLowerCase() === String(v).trim().toLowerCase())));
  if (L) { const ix = L.findIndex(x => x.toLowerCase() === last.trim().toLowerCase()); const st = n >= 2 ? ((ix - L.findIndex(x => x.toLowerCase() === String(vals[n - 2]).trim().toLowerCase())) + L.length) % L.length || 1 : 1; for (let t = 1; t <= k; t++) out.push(L[(ix + st * t) % L.length]); return out; }
  const tm = vals.map(v => String(v ?? "").match(/^(.*?)(\d+)(\D*)$/)); if (tm.every(Boolean) && tm.every(m => m[1] === tm[0][1] && m[3] === tm[0][3]) && !(n === 1 && isFinite(nums[0]))) { const ns = tm.map(m => +m[2]); const st = n >= 2 ? ns[n - 1] - ns[n - 2] : 1; const w = tm[n - 1][2].length; for (let t = 1; t <= k; t++) out.push(tm[0][1] + String(ns[n - 1] + st * t).padStart(/^0/.test(tm[n - 1][2]) ? w : 0, "0") + tm[0][3]); return out; }
  for (let t = 0; t < k; t++) out.push(vals[t % n]); return out; };
// ══════════════════════════════════════════════
// PDF TABLE FINDER: words with positions → tables (works for text PDFs and OCR output)
// words: [{s, x, y, w, h}] with x,y the top-left corner in page units (y grows downward)
// ══════════════════════════════════════════════
const PDF_NUM_RE = /^[-−–(]?[$€£₵¥]?\s?\d[\d,. ]*%?\)?[a-z*†‡]?$|^[-−–]$|^\.\.$|^n\/?a$/i;
const pdfIsNum = (s) => PDF_NUM_RE.test(String(s).trim());
const pdfLines = (words) => {
  const ws=words.filter(w=>w.s && w.s.trim()).map(w=>({ ...w, s:w.s.replace(/\s+/g," ").trim(), cy:w.y+w.h/2 })).sort((a,b)=>a.cy-b.cy||a.x-b.x);
  if (!ws.length) return [];
  const hs=ws.map(w=>w.h).sort((a,b)=>a-b); const mh=hs[Math.floor(hs.length/2)]||10; const lines=[];
  ws.forEach(w=>{ const L=lines[lines.length-1]; if (L && Math.abs(w.cy-L.cy)<=Math.max(2,0.45*Math.min(mh,w.h,L.h))){ L.words.push(w); L.cy=(L.cy*(L.words.length-1)+w.cy)/L.words.length; L.h=Math.max(L.h,w.h); } else lines.push({ cy:w.cy, h:w.h, words:[w] }); });
  // cells: merge words separated by small gaps
  lines.forEach(L=>{ L.words.sort((a,b)=>a.x-b.x); const cells=[]; L.words.forEach(w=>{ const c=cells[cells.length-1]; const gap=c? w.x-c.x1 : Infinity; const space=Math.max(1.2, 0.9*Math.min(w.h, c? c.h : w.h));
      if (c && gap<space) { c.s+=(gap>0.15*w.h? " " : "")+w.s; c.x1=Math.max(c.x1, w.x+w.w); } else cells.push({ s:w.s, x0:w.x, x1:w.x+w.w, h:w.h }); });
    // split a merged cell that holds several numbers separated by spaces ("12.3 14.5 16.0") — common in text extraction
    L.cells=cells.flatMap(c=>{ const parts=c.s.split(/\s+/); let k=parts.length; while (k>0 && pdfIsNum(parts[k-1])) k--;
      // "12.3 14.5 16.0" → three cells; "Ghana 3.1 (2.4) 33,475" → label + three cells
      if (parts.length-k>=2 || (k===0 && parts.length>1)){ const lab=k? [parts.slice(0,k).join(" ")] : []; const all=[...lab, ...parts.slice(k)]; const step=(c.x1-c.x0)/all.length; return all.map((p,q)=>({ s:p, x0:c.x0+q*step, x1:c.x0+(q+1)*step-1, h:c.h, syn:true })); } return [c]; });
    L.y0=Math.min(...L.words.map(w=>w.y)); L.y1=Math.max(...L.words.map(w=>w.y+w.h)); });
  return lines; };
const pdfFindTables = (words, opts={}) => {
  const lines=pdfLines(words); if (lines.length<3) return [];
  const lh=lines.map(l=>l.h).sort((a,b)=>a-b)[Math.floor(lines.length/2)]||10;
  // blocks of consecutive multi-cell lines
  const blocks=[]; let cur=null;
  lines.forEach((L,i)=>{ const multi=L.cells.length>=2; const prev=lines[i-1]; const near=prev && (L.y0-prev.y1) < 2.2*lh;
    if (multi && cur && near) cur.push(L); else if (multi){ cur=[L]; blocks.push(cur); } else if (cur && near && L.cells.length===1 && i+1<lines.length && lines[i+1].cells.length>=2 && (lines[i+1].y0-L.y1)<2.2*lh) cur.push(L); else cur=null; });
  const out=[];
  for (const B of blocks){ if (B.filter(L=>L.cells.length>=2).length<3) continue;
    const bx0=Math.min(...B.flatMap(L=>L.cells.map(c=>c.x0))), bx1=Math.max(...B.flatMap(L=>L.cells.map(c=>c.x1))); const W=bx1-bx0||1;
    // column ranges from the union of cell spans, ignoring very wide cells (titles, notes)
    const spans=B.flatMap(L=>L.cells.filter(c=>(c.x1-c.x0)<0.55*W || L.cells.length>=3).map(c=>[c.x0,c.x1])).sort((a,b)=>a[0]-b[0]);
    // rows written as one text run each ("Ghana 6.5 0.5 5.4"): positions are guesses, so line cells up by order instead
    const synth=B.filter(L=>L.cells.some(c=>c.syn)).length >= 0.6*B.length;
    const cols=[]; if (!synth) spans.forEach(([a,b])=>{ const c=cols[cols.length-1]; if (c && a<=c[1]+0.35*lh) c[1]=Math.max(c[1],b); else cols.push([a,b]); });
    const ncS=synth? Math.max(...B.map(L=>L.cells.length)) : 0; if (!synth && cols.length<2) continue;
    const grid=synth? B.map(L=>{ const r=L.cells.map(c=>c.s); return [...r, ...new Array(ncS-r.length).fill("")]; }) : B.map(L=>{ const row=new Array(cols.length).fill(""); L.cells.forEach(c=>{ let best=0, bo=-Infinity; cols.forEach(([a,b],k)=>{ const ov=Math.min(b,c.x1)-Math.max(a,c.x0); if (ov>bo){ bo=ov; best=k; } }); row[best]= row[best]? row[best]+" "+c.s : c.s; }); return row; });
    // drop columns that are almost always empty
    const keep=(synth? grid[0] : cols).map((_,k)=>grid.filter(r=>r[k]).length >= Math.max(2, 0.25*grid.length)); const g2=grid.map(r=>r.filter((_,k)=>keep[k])); const nc=g2[0]?.length||0; if (nc<2) continue;
    // header rows: leading rows where most filled cells are not numbers
    let hEnd=0; while (hEnd<g2.length-2){ const r=g2[hEnd]; const filled=r.filter(Boolean); const nums=filled.filter(pdfIsNum).length; if (filled.length && nums<=Math.max(0,Math.floor(filled.length/4)) && hEnd<4) hEnd++; else break; }
    // a first row of years (Region | 2019 | 2020 ...) is a header too
    if (hEnd===0 && g2.length>2){ const r=g2[0].slice(1).filter(Boolean); if (r.length>=2 && r.every(x=>/^(1[89]|20)\d\d([-/]\d{2,4})?$|^(Q[1-4]|H[12])\s?\d{4}$/i.test(x.trim())) && !g2.slice(1,4).every(row=>row.slice(1).filter(Boolean).every(x=>/^(1[89]|20)\d\d$/.test(x.trim())))) hEnd=1; }
    const body=g2.slice(hEnd); const cells=body.flatMap(r=>r.slice(1)).filter(Boolean); const numShare=cells.length? cells.filter(pdfIsNum).length/cells.length : 0;
    const fill=body.reduce((s,r)=>s+r.filter(Boolean).length,0)/(body.length*nc);
    if (body.length<2 || (numShare<0.35 && !opts.keepText) || fill<0.4) continue;
    const headers= hEnd? Array.from({length:nc},(_,k)=>g2.slice(0,hEnd).map(r=>r[k]).filter(Boolean).join(" ").trim()) : Array.from({length:nc},(_,k)=> k===0? "label" : `col${k+1}`);
    const seen={}; const H=headers.map((h,k)=>{ let x=h||(k===0?"label":`col${k+1}`); if (seen[x]){ seen[x]++; x=`${x}_${seen[x]}`; } else seen[x]=1; return x; });
    out.push({ headers:H, rows:body, hasHeader:hEnd>0, nRows:body.length, nCols:nc, numericShare:numShare, score:body.length*nc*(0.3+numShare),
      bbox:{ x0:bx0, y0:Math.min(...B.map(L=>L.y0)), x1:bx1, y1:Math.max(...B.map(L=>L.y1)) } }); }
  return out.sort((a,b)=>a.bbox.y0-b.bbox.y0);
};
// Fallback: every text line becomes a row, split where words are far apart
const pdfLinesAsRows = (words) => { const lines=pdfLines(words); const rows=lines.map(L=>L.cells.map(c=>c.s)); const nc=Math.max(1,...rows.map(r=>r.length)); return { headers:Array.from({length:nc},(_,k)=>`col${k+1}`), rows:rows.map(r=>[...r, ...new Array(nc-r.length).fill("")]) }; };
// Clean typical statistical-table number formats: 1,234.5 → 1234.5; (12) → -12; 12% → 12; −5 → -5; 3.2a → 3.2; ".." / "n/a" / "-" → blank
const pdfCleanNumber = (s) => { const t=String(s??"").trim(); if (!t) return ""; if (/^(\.\.|n\/?a|-|–|—|…)$/i.test(t)) return "";
  if (!pdfIsNum(t)) return t; let v=t.replace(/[−–]/g,"-").replace(/[$€£₵¥%\s]/g,"").replace(/[a-z*†‡]$/i,""); const neg=/^\(.*\)$/.test(v); v=v.replace(/[()]/g,"");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v=v.replace(/,/g,""); else if (/^-?\d+,\d+$/.test(v)) v=v.replace(",","."); else v=v.replace(/,/g,"");
  const n=parseFloat(v); return isFinite(n)? String(neg? -n : n) : t; };
// ── browser loaders (CDN, loaded on first use) ──
const wbLoadScript = (src, globalName) => new Promise((res, rej) => { if (globalName && window[globalName]) return res(window[globalName]);
  const s=document.createElement("script"); s.src=src; s.async=true; s.onload=()=>res(globalName? window[globalName] : true); s.onerror=()=>rej(new Error(`Could not load ${src.split("/").slice(-1)[0]}. Check your internet connection.`)); document.head.appendChild(s); });
const PDFJS_VER = "3.11.174";
const wbPdfjs = async () => { const base=window.ECO_PDFJS_BASE || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`; const lib=await wbLoadScript(`${base}/pdf.min.js`, "pdfjsLib"); lib.GlobalWorkerOptions.workerSrc=`${base}/pdf.worker.min.js`; return lib; };
const wbTesseract = () => wbLoadScript(window.ECO_TESSERACT_URL || "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", "Tesseract");
const wbXlsx = () => wbLoadScript(window.ECO_XLSX_URL || "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
// One worksheet → {headers, rows}: first non-empty row is the header; blank rows and trailing blank columns are dropped
const wbSheetTable = (X, ws) => { if (!ws) return null; const raw=X.utils.sheet_to_json(ws, { header:1, raw:false, defval:"", blankrows:false });
  const rows=raw.map(r=>r.map(v=>v==null? "" : String(v).trim())).filter(r=>r.some(v=>v!=="")); if (rows.length<2) return null;
  const nc=Math.max(...rows.map(r=>{ let k=r.length; while (k>0 && r[k-1]==="") k--; return k; })); if (!nc) return null;
  const seen={}; const headers=Array.from({ length:nc },(_,j)=>{ let h=rows[0][j]||`col${j+1}`; if (seen[h]){ seen[h]++; h=`${h}_${seen[h]}`; } else seen[h]=1; return h; });
  return { headers, rows:rows.slice(1).map(r=>Array.from({ length:nc },(_,j)=>r[j]??"")) }; };
const wbMammoth = () => wbLoadScript(window.ECO_MAMMOTH_URL || "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js", "mammoth");
// words of one pdf.js page (text layer). Returns {words, w, h}
const wbPageWords = async (page) => { const vp=page.getViewport({ scale:1 }); const tc=await page.getTextContent();
  const words=tc.items.filter(it=>it.str && it.str.trim()).map(it=>{ const [a,b,,d,e,f]=it.transform; const h=Math.hypot(b,d)||Math.abs(d)||Math.abs(a)||10; return { s:it.str, x:e, y:vp.height-f-h*0.85, w:it.width||(it.str.length*h*0.5), h }; });
  return { words, w:vp.width, h:vp.height }; };
// OCR one page: render to canvas at 2x, recognise, return words in page units
const wbOcrPage = async (page, onProgress) => { const T=await wbTesseract(); const vp=page.getViewport({ scale:2 }); const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
  await page.render({ canvasContext:cv.getContext("2d"), viewport:vp }).promise;
  const r=await T.recognize(cv, "eng", { logger:m=>{ if (m.status==="recognizing text" && onProgress) onProgress(m.progress); }, ...(window.ECO_TESSERACT_OPTS||{}) });
  const words=(r.data.words||[]).filter(w=>w.text && w.confidence>30).map(w=>({ s:w.text, x:w.bbox.x0/2, y:w.bbox.y0/2, w:(w.bbox.x1-w.bbox.x0)/2, h:(w.bbox.y1-w.bbox.y0)/2 }));
  return { words, w:vp.width/2, h:vp.height/2 }; };
// ══════════════════════════════════════════════
// EXPORT RESULTS: LaTeX, Excel, Word (.docx), PDF (print), chart PNG/SVG (v31)
// ══════════════════════════════════════════════
const wxSlug = (s) => String(s || "results").replace(/^to_/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "results";
const wxSave = (blob, name) => { const a = document.createElement("a"); const url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500); };
const wxZip = () => wbLoadScript(window.ECO_JSZIP_URL || "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
const wxXmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wxIsNum = (c) => /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?(e[-+]?\d+)?$/i.test(String(c ?? "").trim());
// ── charts: find the drawing inside an element and turn it into SVG text and a PNG ──
const wxChartSvg = (el) => { if (!el) return null; const svgs = [...el.querySelectorAll("svg")].map(s => { const r = s.getBoundingClientRect(); return { s, a: r.width * r.height, w: r.width, h: r.height }; }).filter(x => x.a > 4000).sort((p, q) => q.a - p.a);
  if (!svgs.length) return null; const { s, w, h } = svgs[0]; const c = s.cloneNode(true); c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", Math.round(w)); c.setAttribute("height", Math.round(h)); if (!c.getAttribute("viewBox")) c.setAttribute("viewBox", `0 0 ${Math.round(w)} ${Math.round(h)}`);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#ffffff"); c.insertBefore(bg, c.firstChild);
  c.setAttribute("style", "font-family: Arial, Helvetica, sans-serif; background:#fff"); c.querySelectorAll("text").forEach(t => { const f = t.getAttribute("fill"); if (!f || /^var\(/.test(f)) t.setAttribute("fill", "#222222"); });
  return { svg: new XMLSerializer().serializeToString(c), w: Math.round(w), h: Math.round(h) }; };
const wxChartPng = (el, scale = 2) => new Promise((res) => { if (!el) return res(null); const cv = [...el.querySelectorAll("canvas")].sort((p, q) => q.width * q.height - p.width * p.height)[0];
  const sv = wxChartSvg(el); if (!sv && cv) { try { return res({ url: cv.toDataURL("image/png"), w: cv.clientWidth || cv.width, h: cv.clientHeight || cv.height }); } catch (e) { return res(null); } } if (!sv) return res(null);
  const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = sv.w * scale; c.height = sv.h * scale; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); try { res({ url: c.toDataURL("image/png"), w: sv.w, h: sv.h, svg: sv.svg }); } catch (e) { res(null); } };
  img.onerror = () => res(null); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sv.svg); });
const wxDataUrlBytes = (url) => { const b = atob(url.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

export { CE_ERRS, FX_ALIAS, FX_COMMANDS, FX_FUNCS, ST_CMDS, ST_GROUPS, ceAddr, ceColName, ceCycleRef, ceDeps, ceErrOf, ceEval, ceScan, ceSeries, ceShift, ceShow, fxEval, fxParse, fxRowNames, fxRunAsync, fxWrapCols, pdfCleanNumber, pdfFindTables, pdfLinesAsRows, stTexEsc, stTexKv, stTexTable, wbMammoth, wbOcrPage, wbPageWords, wbPdfjs, wbSheetTable, wbXlsx, wxChartPng, wxChartSvg, wxDataUrlBytes, wxIsNum, wxSave, wxSlug, wxXmlEsc, wxZip };
