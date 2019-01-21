const express = require('express');
const bodyParser = require('body-parser');
const mongodb = require('mongodb');
var crypto = require('crypto');
const uuid = require('uuid/v1'); // v1 is timestamp-based
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'nick[expletive]ingredmond';
const STARTING_CHIPS_QTY = process.env.STARTING_CHIPS_QTY || 2500;
const CHARITY_NAVIGATOR_APP_ID = process.env.CHARITY_NAVIGATOR_APP_ID || null; // todo: add this when ready for testing
const CHARITY_NAVIGATOR_API_KEY = process.env.CHARITY_NAVIGATOR_API_KEY || null;

Date.prototype.addHours = function(h) {    
    this.setTime(this.getTime() + (h*60*60*1000)); 
    return this;   
}

// todo: ALL IPs ARE WHITELISTED IN ATLAS; change this to production setup when ready
const MongoClient = mongodb.MongoClient;
const pokerGiverDbUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const pokerGiverDbName = process.env.DATABASE_NAME || 'heroku_0l0fvk2m'; // default is sandbox
let cachedDb = null;

var names = ["Emily","Hannah","Madison","Ashley","Sarah","Alexis","Samantha","Jessica","Taylor","Lauren","Alyssa","Kayla","Abigail","Brianna","Olivia","Emma","Megan","Grace","Victoria","Rachel","Anna","Sydney","Destiny","Morgan","Jennifer","Jasmine","Haley","Julia","Kaitlyn","Nicole","Amanda","Natalie","Hailey","Savannah","Chloe","Rebecca","Maria","Sophia","Allison","Isabella","Amber","Mary","Danielle","Jordan","Brooke","Michelle","Sierra","Katelyn","Andrea","Madeline","Sara","Kimberly","Courtney","Erin","Brittany","Vanessa","Jenna","Caroline","Faith","Makayla","Bailey","Paige","Shelby","Melissa","Kaylee","Trinity","Mariah","Caitlin","Autumn","Marissa","Breanna","Angela","Zoe","Briana","Jada","Laura","Claire","Alexa","Kelsey","Kathryn","Leslie","Sabrina","Mia","Isabel","Molly","Leah","Katie","Cheyenne","Tiffany","Erica","Lindsey","Kylie","Amy","Diana","Cassidy","Mikayla","Ariana","Margaret","Kelly","Miranda","Maya","Melanie","Audrey","Jade","Gabriela","Caitlyn","Angel","Jillian","Alicia","Jocelyn","Erika","Lily","Heather","Madelyn","Adriana","Arianna","Lillian","Kiara","Riley","Crystal","Mckenzie","Meghan","Skylar","Ana","Britney","Angelica","Kennedy","Chelsea","Daisy","Kristen","Veronica","Isabelle","Summer","Hope","Brittney","Lydia","Hayley","Evelyn","Bethany","Shannon","Michaela","Karen","Jamie","Daniela","Angelina","Kaitlin","Karina","Sophie","Sofia","Diamond","Payton","Cynthia","Alexia","Valerie","Monica","Peyton","Carly","Bianca","Hanna","Brenda","Rebekah","Mya","Avery","Brooklyn","Ashlyn","Lindsay","Ava","Desiree","Alondra","Camryn","Ariel","Naomi","Jordyn","Kendra","Mckenna","Holly","Julie","Kendall","Kara","Jasmin","Selena","Amaya","Kylee","Maggie","Makenzie","Claudia","Kyra","Cameron","Karla","Kathleen","Abby","Delaney","Amelia","Casey","Serena","Savanna","Aaliyah","Giselle","Mallory","April","Raven","Adrianna","Kristina","Nina","Asia","Natalia","Valeria","Aubrey","Lauryn","Kate","Patricia","Jazmin","Rachael","Katelynn","Cierra","Alison","Macy","Nancy","Elena","Kyla","Katrina","Jazmine","Joanna","Tara","Gianna","Juliana","Fatima","Allyson","Gracie","Sadie","Genesis","Yesenia","Julianna","Skyler","Tatiana","Alexus","Alana","Elise","Kirsten","Nadia","Sandra","Ruby","Haylee","Jayla","Tori","Cindy","Sidney","Ella","Tessa","Carolina","Camille","Whitney","Carmen","Vivian","Bridget","Celeste","Kiana","Makenna","Alissa","Miriam","Natasha","Ciara","Cecilia","Mercedes","Reagan","Aliyah","Rylee","Shania","Kira","Meredith","Eva","Lisa","Dakota","Hallie","Anne","Rose","Liliana","Kristin","Deanna","Imani","Marisa","Kailey","Annie","Nia","Carolyn","Brenna","Dana","Shayla","Ashlee","Kassidy","Alaina","Rosa","Wendy","Logan","Tabitha","Paola","Callie","Addison","Lucy","Gillian","Clarissa","Destinee","Josie","Esther","Denise","Katlyn","Mariana","Bryanna","Emilee","Georgia","Deja","Kamryn","Ashleigh","Cristina","Baylee","Heaven","Ruth","Raquel","Monique","Teresa","Helen","Krystal","Tiana","Cassie","Kayleigh","Marina","Heidi","Ivy","Ashton","Clara","Meagan","Gina","Linda","Gloria","Ellie","Jenny","Renee","Daniella","Lizbeth","Anahi","Virginia","Gisselle","Kaitlynn","Julissa","Cheyanne","Lacey","Haleigh","Marie","Martha","Eleanor","Kierra","Tiara","Talia","Eliza","Kaylie","Mikaela","Harley","Jaden","Hailee","Madalyn","Kasey","Ashlynn","Brandi","Lesly","Allie","Viviana","Cara","Marisol","India","Tatyana","Litzy","Melody","Jessie","Brandy","Alisha","Hunter","Noelle","Carla","Tia","Layla","Krista","Zoey","Carley","Janet","Carissa","Iris","Kaleigh","Tyler","Susan","Tamara","Theresa","Yasmine","Tatum","Sharon","Alice","Yasmin","Tamia","Abbey","Alayna","Kali","Lilly","Bailee","Lesley","Mckayla","Ayanna","Serenity","Karissa","Precious","Jane","Maddison","Jayda","Kelsie","Lexi","Phoebe","Halle","Kiersten","Kiera","Tyra","Annika","Felicity","Taryn","Kaylin","Ellen","Kiley","Jaclyn","Rhiannon","Madisyn","Colleen","Joy","Pamela","Charity","Tania","Fiona","Alyson","Kaila","Emely","Alina","Irene","Johanna","Regan","Janelle","Janae","Madyson","Paris","Justine","Chelsey","Sasha","Paulina","Mayra","Zaria","Skye","Cora","Brisa","Emilie","Felicia","Larissa","Macie","Tianna","Aurora","Sage","Lucia","Alma","Chasity","Ann","Deborah","Nichole","Jayden","Alanna","Malia","Carlie","Angie","Nora","Kailee","Sylvia","Carrie","Elaina","Sonia","Kenya","Piper","Marilyn","Amari","Macey","Marlene","Barbara","Tayler","Julianne","Lorena","Perla","Elisa","Kaley","Leilani","Eden","Miracle","Devin","Aileen","Chyna","Athena","Regina","Adrienne","Shyanne","Luz","Tierra","Cristal","Clare","Eliana","Kelli","Eve","Sydnee","Madelynn","Breana","Melina","Arielle","Justice","Toni","Corinne","Maia","Tess","Abbigail","Ciera","Ebony","Maritza","Lena","Lexie","Isis","Aimee","Leticia","Sydni","Sarai","Halie","Alivia","Destiney","Laurel","Edith","Carina","Fernanda","Amya","Destini","Aspen","Nathalie","Paula","Tanya","Frances","Tina","Elaine","Shayna","Aniya","Mollie","Ryan","Essence","Simone","Kyleigh","Nikki","Anya","Reyna","Kaylyn","Savanah","Abbie","Montana","Kailyn","Itzel","Leila","Cayla","Stacy","Araceli","Robin","Dulce","Candace","Noemi","Jewel","Aleah","Ally","Mara","Nayeli","Karlee","Keely","Alisa","Micaela","Desirae","Leanna","Antonia","Brynn","Jaelyn","Judith","Raegan","Katelin","Sienna","Celia","Yvette","Juliet","Anika","Emilia","Calista","Carlee","Eileen","Kianna","Thalia","Rylie","Daphne","Kacie","Karli","Rosemary","Ericka","Jadyn","Lyndsey","Micah","Hana","Haylie","Madilyn","Laila","Blanca","Kayley","Katarina","Kellie","Maribel","Sandy","Joselyn","Kaelyn","Madisen","Carson","Kathy","Stella","Juliette","Devon","Camila","Bria","Donna","Helena","Lea","Jazlyn","Jazmyn","Skyla","Christy","Joyce","Karlie","Lexus","Salma","Delilah","Moriah","Celine","Lizeth","Beatriz","Brianne","Kourtney","Sydnie","Stacey","Mariam","Robyn","Hayden","Janessa","Kenzie","Jalyn","Sheila","Meaghan","Aisha","Jaida","Shawna","Estrella","Marley","Melinda","Ayana","Karly","Devyn","Nataly","Loren","Brielle","Laney","Lizette","Sally","Tracy","Lilian","Rebeca","Chandler","Jenifer","America","Candice","Diane","Abigayle","Susana","Aliya","Casandra","Harmony","Jacey","Alena","Aylin","Carol","Shea","Stephany","Aniyah","Zoie","Alia","Savana","Damaris","Violet","Marian","Anita","Jaime","Jaiden","Kristine","Carli","Dorothy","Gretchen","Janice","Annette","Mariela","Amani","Maura","Bella","Kaylynn","Lila","Armani","Anissa","Aubree","Kelsi","Greta","Kaya","Kayli","Lillie","Willow","Ansley","Catalina","Lia","Maci","Celina","Shyann","Alysa","Jaquelin","Kasandra","Quinn","Cecelia","Mattie","Chaya","Hailie","Haven","Kallie","Maegan","Maeve","Rocio","Yolanda","Christa","Gabriel","Kari","Noelia","Jeanette","Kaylah","Marianna","Nya","Kennedi","Presley","Yadira","Elissa","Nyah","Reilly","Shaina","Alize","Arlene","Amara","Izabella","Lyric","Aiyana","Allyssa","Drew","Rachelle","Adeline","Jacklyn","Jesse","Citlalli","Liana","Giovanna","Princess","Selina","Brook","Elyse","Graciela","Cali","Berenice","Chanel","Iliana","Jolie","Caitlynn","Annalise","Cortney","Darlene","Sarina","Dasia","London","Yvonne","Karley","Shaylee","Myah","Amira","Juanita","Kristy","Ryleigh","Dariana","Teagan","Kiarra","Ryann","Yamilet","Alexys","Kacey","Shakira","Sheridan","Baby","Dianna","Lara","Isabela","Reina","Shirley","Jaycee","Silvia","Tatianna","Eryn","Ingrid","Keara","Randi","Reanna","Kalyn","Lisette","Lori","Abril","Ivana","Kaela","Maranda","Parker","Darby","Darian","Jasmyn","Jaylin","Katia","Ayla","Hillary","Kinsey","Yazmin","Caleigh","Elyssa","Rita","Asha","Dayana","Nikita","Chantel","Reese","Stefanie","Nadine","Samara","Unique","Michele","Sonya","Hazel","Patience","Cielo","Mireya","Paloma","Aryanna","Anaya","Dallas","Arely","Joelle","Kaia","Misty","Norma","Taya","Deasia","Trisha","Elsa","Joana","Alysha","Aracely","Bryana","Dawn","Brionna","Alex","Katerina","Ali","Bonnie","Hadley","Martina","Maryam","Jazmyne","Shaniya","Alycia","Dejah","Emmalee","Jakayla","Lilliana","Nyasia","Anjali","Daisha","Myra","Amiya","Belen","Jana","Saige","Aja","Annabel","Scarlett","Joanne","Aliza","Ashly","Cydney","Destany","Fabiola","Gia","Keira","Roxanne","Kaci","Abigale","Abagail","Janiya","Odalys","Aria","Daija","Delia","Kameron","Ashtyn","Katy","Lourdes","Raina","Dayna","Emerald","Kirstin","Marlee","Neha","Beatrice","Blair","Kori","Luisa","Breonna","Jena","Leann","Rhianna","Yasmeen","Yessenia","Breanne","Laisha","Mandy","Amina","Jailyn","Jayde","Jill","Katlynn","Kaylan","Kenna","Rayna","Iyana","Keeley","Kenia","Maiya","Melisa","Sky","Adrian","Marlen","Shianne","Alysia","Audra","Malaysia","Aubrie","Infant","Kaycee","Kendal","Shelbie","Chana","Kalie","Chelsie","Evelin","Janie","Leanne","Ashlie","Dalia","Lana","Suzanne","Ashanti","Juana","Kelley","Marcella","Tristan","Johana","Lacy","Noel","Bryn","Ivette","Jamya","Mikala","Nyla","Yamile","Jailene","Katlin","Keri","Sarahi","Shauna","Tyanna","Noor","Flor","Makena","Miya","Sade","Natalee","Pearl","Corina","Starr","Hayleigh","Niya","Star","Baylie","Beyonce","Rochelle","Roxana","Vanesa","Charisma","Santana","Frida","Melany","Octavia","Cameryn","Jasmyne","Keyla","Lilia","Lucero","Madalynn","Jackelyn","Libby","Danica","Halee","Makala","Stevie","Cailey","Charlene","Dania","Denisse","Iyanna","Shana","Tammy","Tayla","Elisha","Kayle","Liberty","Shyla","Dina","Judy","Priscila","Ada","Carleigh","Eunice","Janette","Jaylene","Latavia","Xiomara","Caylee","Gwyneth","Lexis","Yajaira","Kaytlin","Aryana","Jocelyne","Myranda","Tiffani","Gladys","Kassie","Kaylen","Mykayla","Anabel","Beverly","Blake","Demi","Emani","Justina","Keila","Makaila","Colette","Estefany","Jalynn","Joslyn","Kerry","Marisela","Miah","Anais","Cherish","Destinie","Elle","Jennie","Lacie","Odalis","Stormy","Daria","Halley","Lina","Tabatha","Angeline","Hollie","Jayme","Jaylynn","Maricela","Maxine","Mina","Estefani","Shaelyn","Mckinley","Alaysia","Jessika","Lidia","Maryann","Samira","Shelbi","Betty","Connie","Iman","Mira","Shanice","Susanna","Jaylyn","Kristi","Sariah","Serina","Shae","Taniya","Winter","Mindy","Rhea","Tristen","Danae","Jamia","Natalya",
    "Siena","Areli","Daja","Jodi","Leeann","Rianna","Yulissa","Alyssia","Ciarra","Delanie","Nautica","Tamera","Tionna","Alecia","Astrid","Breann","Journey","Kaiya","Lynn","Zariah","Adilene","Annalisa","Chyanne","Jalen","Kyara","Camilla","Monet","Priya","Akira","Cori","Fallon","Giana","Naya","Shreya","Tanisha","Debra","Irma","Lissette","Lorraine","Magaly","Mahogany","Marcela","Abrianna","Alexi","Amaris","Cailyn","Hali","Joan","Kelsea","Lainey","Chastity","Isabell","Maleah","Tasha","Terra","Beth","Elana","Mariel","Maureen","Shantel","Coral","Grayson","Ivanna","Katheryn","Olga","Addie","Bayleigh","Rowan","Taliyah","Yareli","Betsy","Geneva","Grecia","Kristian","Kya","Leigha","Racheal","Tamya","Yoselin","Alea","Breeanna","Harlee","Marlena","Shay","Zion","Citlali","Colby","Julisa","Simran","Yaritza","Cathryn","Griselda","Jessenia","Lucille","Dara","Kala","Madysen","Micayla","Sommer","Haily","Karyme","Lisbeth","Shanna","Brittani","China","Daijah","Danika","Kerri","Keyanna","Monika","Triniti","Cailin","Isela","Kalli","Amalia","Brea","Dajah","Jolene","Kaylea","Mason","Rivka","Yessica","Bobbie","Tyana","Shelly","Billie","Chantal","Jami","Kaytlyn","Nathaly","Pauline","Aidan","Aleena","Danyelle","Jaylen","Katya","Kendyl","Lesli","Mari","Analisa","Kalista","Kayleen","Kortney","Kristyn","Lola","Luna","Brieanna","Corrine","Elsie","Harlie","Cloe","Jackie","Kalee","Leandra","Magali","Shamya","Tatiyana","Zainab","Aliah","Alliyah","Anisa","Elexis","Ireland","Jala","Kylah","Marion","Mercedez","Alyse","Annmarie","Azaria","Gissel","Jacy","Joann","Kiya","Liza","Macayla","Britany","Kristal","Maren","Acacia","Alli","Christen","Deana","Makaela","Makenzi","Tonya","Dahlia","Keyana","Krysta","Nallely","Emerson","Jaci","Jacie","Jalisa","Joseline","Karsyn","Keisha","Marianne","Maryjane","Phoenix","Terri","Tyasia","Yamileth","Amiyah","Darcy","Galilea","Georgina","Harper","Tasia","Adia","Bree","Ivory","Kierstin","Meadow","Nathalia","Xochitl","Adelaide","Amberly","Calli","Deandra","Desire","Mackenna","Mallorie","Anisha","Brigid","Janna","Jocelynn","Keanna","Kia","Mae","Makiya","Yahaira","Adamaris","Ania","Ivonne","Janaya","Kai","Karah","Marin","Rosalie","Aleigha","Ashli","Mika","Penelope","Rosario","Aislinn","Amirah","Charlie","Jaelynn","Madelyne","Renae","Aiyanna","Anabelle","Cinthia","Dylan","Eboni","Janeth","Jayna","Kinley","Laken","Lyndsay","Mikaila","Moira","Nikole","Vicky","Amie","Belinda","Cheryl","Chynna","Dora","Jaquelyn","Nakia","Tehya","Treasure","Valencia","Adela","Aliana","Alora","Ashely","Averi","Eleni","Janell","Kalynn","Livia","Mona","Rena","Riya","Sherry","Tionne","Annelise","Brissa","Jania","Jensen","Lora","Lynette","Samaria","Shanya","Ximena","Adrianne","Ainsley","Bobbi","Heidy","Jaidyn","Linnea","Malorie","Melia","Mickayla","Riana","Roxanna","Tiarra","Christie","Dymond","Kathrine","Keyonna","Kiah","Kyndall","Leia","Leigh","Maliyah","Sonja","Symone","Allysa","Anyssa","Ariella","Keegan","Natali","Yulisa","Alesha","Demetria","Johnna","Keana","Lynsey","Siera","Tatyanna","Zara","Chiara","Emalee","Giavanna","Amiah","Autum","Briley","Cathy","Christin","Hattie","Jazlynn","Bryce","Chase","Cherokee","Devan","Ilana","Jean","Jesenia","Lela","Lianna","Rubi","Trista","Amaiya","Farrah","Francis","Imari","Kim","Pilar","Selene","Susannah","Alannah","Ananda","Madelin","Madilynn","Nicolle","Rileigh","Sana","Selah","Valery","Alani","Emelia","Hayli","Janay","Jeniffer","Joselin","June","Marla","Michael","Noa","Shira","Ayesha","Dixie","Hanah","Jaycie","Juliann","Maddie","Nelly","Zahra","Edna","Jadah","Jaela","Karolina","Laci","Lanie","Malka","Mercy","Milena","Tyla","Bayley","Callista","Candy","Caylin","Jessi","Julieta","Karleigh","Kyndal","Lizet","Louise","Sanjana","Sheyla","Shivani","Thea","Tracey","Aya","Bethanie","Danna","Daysha","Jayleen","Kaeli","Kaliyah","Karime","Kinsley","Linsey","Lucinda","Maira","Tierney","Angeles","Anjelica","Aysha","Bridgett","Divya","Ginger","Jamila","Kaili","Klarissa","Meg","Raelynn","Salena","Sequoia","Amia","Ashlin","Dayanara","Isha","Jordin","Kelis","Krysten","Leona","Lexy","Makaylah","Notnamed","Raelyn","Sabina","Sahara","Shekinah","Siobhan","Tiera","Yaquelin","Alanis","Ambria","Anai","Caley","Catrina","Gemma","Jodie","Malika","Marjorie","Sunny","Abriana","Alexcia","Ayleen","Brynne","Dalila","Erykah","Ileana","Jaila","Jessalyn","Kirstyn","Margo","Myia","Mykala","Stacie","Tristin","Analise","Andie","Arden","Averie","Aysia","Brylee","Doris","Janine","Jennah","Keona","Leyla","Shakayla","Taylar","Tea","Verania","Allissa","Arleth","Babygirl","Corrina","Holland","Josefina","Julian","Keyara","Rayne","Rayven","Shiann","Stefani","Stefany","Whitley","Annalee","Asya","Charlize","Chassidy","Deisy","Emery","Gissell","Kami","Khadijah","Rhonda","Vera","Yazmine","Zaira","Ciana","Ester","Gisel","Gracelyn","Jorden","Kelsy","Mackenzi","Oriana","Reece","Saira","Tanner","Yesica","Briza","Jacinda","Jaliyah","Jaya","Kalia","Kameryn","Kearra","Kerrigan","Lilianna","Nayely","Tricia","Dasha","Emmaline","Izabel","Jaimie","Jaylah","Jazzmine","Keasia","Leena","Malina","Pricilla","Ryanne","Scarlet","Tamar","Abbigale","Adelina","August","Ayah","Flora","Harleigh","Jerrica","Kaylene","Keren","Khloe","Kyana","Marielle","Nevaeh","Ryley","Spencer","Valarie","Yuliana","Ariyana","Brooklin","Desiray","Dyamond","Estela","Jayne","Kailah","Kalei","Karis","Laurie","Malinda","Rosie","Salina","Shalyn","Shoshana","Bernice","Chanelle","Dani","Darla","Destanie","Gisell","Heavenly","Joi","Josey","Lyla","Markayla","Davina","Egypt","Elvira","Glenda","Janel","Kelcie","Maricruz","Nadya","Nailah","Sapphire","Saylor","Shiloh","Sunshine","Trina","Winnie","Aida","Amethyst","Cecily","Dionna","Layne","Portia","Taelor","Adele","Alessia","Andria","Carsyn","Cianna","Dynasty","Elayna","Frankie","Gracen","Hayle","Kaileigh","Keyona","Marta","Michell","Nakayla","Raeann","Zakiya","Cami","Gracyn","Jaylee","Malena","Marcia","Mirian","Myla","Teanna","Zhane","Bertha","Dena","Izabelle","Janiyah","Kierstyn","Lupita","Milan","Patrice","Reem","Sarena","Soraya","Suzanna","Therese","Vianey","Wynter","Adina","Angelika","Carter","Catelyn","Desteny","Jessa","Krystina","Lilah","Loretta","Mekayla","Milagros","Nakiya","Petra","Ravyn","Tegan","Tiffanie","Allana","Arabella","Bailie","Charlee","Christal","Iesha","Janiah","Jourdan","Kaelin","Kailynn","Karsen","Margot","Payten","Soleil","Trinitee","Tyesha","Alaysha","Alexius","Alisia","Anayeli","Ani","Elysia","Jocelin","Jovanna","Kacy","Kerstin","Keziah","Kristie","Lilith","Louisa","Mariyah","May","Paisley","Rene","Samanta","Shantell","Adison","Citlaly","Deonna","Dolores","Ida","Karson","Katilyn","Litzi","Lynda","Maisie","Merissa","Niyah","Remy","Shaylynn","Shyanna","Alexxis","Arianne","Azucena","Brandie","Celena","Farah","Hilary","Jael","Maile","Mattison","Mekenzie","Shaylyn","Starla","Yael","Yaneli","Abbygail","Breeana","Briona","Janya","Jesica","Kaycie","Kyrsten","Lani","Makyla","Michayla","Monae","Myesha","Ria","Saray","Shaylin","Susie","Tory","Veronika","Alise","Alyvia","Cambria","Charis","Denisha","Evan","Gracey","Jamiya","Joceline","Porsha","Rory","Rosalyn","Stacia","Talya","Torie","Venus","Alix","Aminah","Baleigh","Breauna","Consuelo","Emoni","Genna","Malaya","Olyvia","Zharia","Angelia","Ariah","Aundrea","Brittni","Cloey","Faye","Jadelyn","Jaeda","Jamaya","Luciana","Nechama","Rikki","Rilee","Sayra","Shanelle","Sloane","Tala","Zaire","Araya","Carlene","Chyenne","Dayanna","Deirdre","Dominque","Elianna","Emmy","Hilda","Honesty","Jaslyn","Jazzmin","Jordon","Kalea","Karena","Mykenzie","Nydia","Rheanna","Shaye","Amyah","Angelita","Becky","Gabriele","Hadassah","Haileigh","Kalina","Kora","Mckenzi","Mildred","Millie","Sawyer","Sela","Selma","Stormie","Verenice","Viktoria","Vivianna","Yara","Alba","Anamaria","Baileigh","Brynna","Caylie","Fayth","Giulia","Jennyfer","Jerica","Jewell","Joey","Katalina","Kaytlynn","Kyanna","Kyrah","Lili","Naudia","Nour","Rian","Shamari","Tytiana","Addyson","Asiah","Corrin","Elliana","Elora","Emme","Faigy","Indya","Kandace","Macee","Myka","Neida","Siara","Arlette","Dezirae","Halli","Kimora","Lane","Madaline","Mila","Pooja","Ramona","Trinidy","Aditi","Alaya","Arriana","Aubry","Brigitte","Brinley","Clarisa","Holli","Ines","Kaira","Kera","Kyler","Lilli","Mandi","Marah","Matilda","Mirella","Nada","Shaniyah","Ajah","Alanah","Becca","Chandra","Chole","Chrystal","Cienna","Elexus","Elicia","Giuliana","Jamesha","Kaelynn","Karmen","Keiara","Khalia","Kyah","Lois","Tanaya","Adara","Ailyn","Ariadna","Arionna","Baily","Breasia","Cheyann","Debbie","Denae","Jeanne","Lucie","Mabel","Rashel","Sierrah","Sloan","Sofie","Tressa","Xena","Abrielle","Belle","Breona","Gisela","Jaedyn","Kay","Keturah","Leeanna","Lindy","Morgen","Promise","Rae","Rebecka","Rosalia","Sheyenne","Siani","Angelena","Aryn","Bianka","Charley","Deena","Elia","Jazzlyn","Kady","Kamille","Karin","Quincy","Ragan","Shawnee","Sterling","Taina","Anabella","Ashlynne","Brianda","Destani","Jaimee","Jonae","Kaniya","Karoline","Landry","Latasha","Liz","Magnolia","Maryssa","Michala","Peri","Racquel","Rebeka","Shaila","Suzette","Tahlia","Traci","Amal","Capri","Catarina","Codi","Destine","Devorah","Dezarae","Ivey","Jackelin","Janai","Josette","Kandice","Mackayla","Mai","Margaux","Micaiah","Nijah","Raylene","Taja","Zulema","Abygail","Aleisha","Aleya","Allegra","Aniah","Braelyn","Clarice","Corey","Fatimah","Jalissa","Jimena","Kamaria","Kiarah","Leana","Leslye","Mahala","Melodie","Montanna","Raine","Sahar","Tyonna","Yanira","Arika","Ariyanna","Briauna","Bronwyn","Danasia","Elvia","Fantasia","Gizelle","Inez","Joni","Lorna","Makiah","Mykaela","Noelani","Rachell","Samia","Shelley","Teri","Violeta","Abbi","Abigael","Agnes","Althea","Ashia","Casie","Charli","Cinthya","Dejanae","Echo","Ember","Gabriell","Gena","Gwen","Kalani","Karisma","Karyn","Khadija","Lakayla","Latoya","Nellie","Paxton","Peighton","Sedona","Tamika","Yenifer","Zipporah","Adria","Alexsis","Aminata","Ananya","Cassady","Citlally","Cyan","Divine","Eman","Emiley","Eryka","Estella","Eugenia","Francine","Geena","Jody","Larisa",
    "Lee","Marykate","Moesha","Najah","Nisha","Rania","Rayanna","Renata","Tana","Aline","Amaria","Ami","Anja","Arin","Azia","Carlyn","Chante","Cheyanna","Cleo","Dianne","Emili","Evie","Gema","Jakia","Jamilet","Jannet","Jenae","Jenessa","Kaily","Kamari","Kayce","Keonna","Kilee","Latrice","Maisy","Manuela","Melani","Nohemi","Nova","Nylah","Pricila","Raeanne","Remi","Roberta","Sheena","Taliah","Timia","Yisel","Zaida","Angelic","Britni","Channing","Corinna","Desirea","Dinah","Ilene","Janasia","Jordynn","Kasie","Keiana","Kenley","Kyli","Lakeisha","Laniya","Markia","Mattea","Meranda","Miyah","Nubia","Rana","Richelle","Shaniah","Shealyn","Tais","Tristyn","Yarely","Yatzari","Anahy","Avalon","Chloee","Cordelia","Darien","Dorian","Jacee","Jailine","Kamya","Kelsee","Lilibeth","Myasia","Nikayla","Noah","Shawn","Tavia","Tytianna","Alesia","Ashlea","Asma","Bayli","Briseida","Charissa","Connor","Daniel","Danya","Debora","Erynn","Estelle","Holley","Indira","Janiece","Jaymee","Jeana","Joely","Kelci","Lluvia","Lorelei","Mecca","Michal","Mitzy","Passion","Shamia","Staci","Tamiya","Thais","Tracie","Yoana","Ajanae","Avianna","Blessing","Cadence","Camden","Chasidy","Crista","Destanee","Deysi","Elly","Jailynn","Jaymie","Kaylei","Keaira","Kitana","Kristan","Lakota","Mariya","Ricki","Sneha","Tajah","Yamilex","Aerial","Aislynn","Analicia","Briannah","Cera","Cosette","Elina","Gwenyth","Keirsten","Kennedie","Kenzi","Kiyana","Kloe","Lamya","Lisset","Magen","Maite","Malea","Maliah","Quiana","Shianna","Sylvie","Vannessa","Wanda","Yanet","Andi","Anessa","Annah","Aubriana","Audrie","Azalea","Blythe","Breyana","Cambrie","Danisha","Elisia","Florence","Josselyn","Jurnee","Karizma","Kathia","Kayden","Kodi","Mackenzy","Mirna","Naja","Niamh","Niki","Noemy","Raeanna","Rebekka","Seanna","Shanaya","Sonali","Storm","Tanna","Tate","Veda","Vivica","Vivien","Zoya","Amayah","Briann","Bryonna","Caterina","Chassity","Deidra","Eloise","Elva","Jacob","Jovana","Kennady","Khayla","Kyrstin","Lacee","Lashay","Latisha","Micheala","Michela","Morghan","Myriam","Queen","Rain","Raya","Shanell","Shani","Soledad","Alasia","Aurelia","Brittnee","Camry","Chyann","Dafne","Dasani","Destyni","Haile","Kaelee","Kalena","Kamila","Kati","Korina","Krystin","Mikah","Mikaylah","Neely","Nigeria","Nyesha","Page","Priyanka","Torrie","Alayah","Azariah","Blakely","Brienna","Britnee","Brittny","Calla","Chelsy","Dezaray","Emilly","Evelynn","Imelda","Jaeden","Jamiah","Jayci","Jeannie","Jenelle","Jeri","Joie","Joycelyn","Kallista","Karisa","Kaydee","Keagan","Kiran","Kiyah","Leighann","Madisson","Malaika","Maryanne","Mitzi","Nichelle","Paiton","Rebekkah","Taniyah","Tarah","Tylar","Aiden","Alyna","Cady","Carmela","Carolynn","Cathleen","Cidney","Danelle","Emi","Emmeline","Felisha","Grayce","Isobel","Iyonna","Joscelyn","Julieann","Kadie","Kailin","Karma","Kenadee","Kendell","Lakia","Lakin","Leora","Loryn","Love","Mariella","Maycee","Mckenzy","Norah","Odessa","Peggy","Samatha","Shalynn","Shante","Sindy","Skylynn","Willa","Adreanna","Alexie","Alijah","Alyah","Ambar","Briahna","Caprice","Cayley","Daisey","Dalilah","Dayla","Deziree","Jaylan","Jianna","Jose","Kassi","Kathryne","Keirra","Kionna","Kolby","Kyndra","Lakyn","Malak","Mariama","Marlie","Rainey","Rina","Sabine","Samone","Samya","Shamiya","Sincere","Uma","Yanely","Zahria","Afton","Alaura","Aleyah","Anusha","Breyanna","Cailee","Cody","Corin","Daeja","Elli","Ellison","Gisele","Idalis","Jakiya","Janelly","Jazmen","Jenica","Joshua","Joslynn","Kateri","Kieran","Kyley","Lanae","Maha","Maryah","Naila","Nanci","Nicola","Nisa","Ofelia","Schuyler","Sinai","Torri","Zoee","Zykeria","Alexyss","Alianna","Alona","Alonna","Collette","Dajanae","Dakotah","Daysi","Dharma","Emmie","Gitty","Indigo","Italia","Jakyra","Janea","Jenesis","Jolee","Kailani","Kalen","Kaliah","Kalysta","Kasia","Kathlyn","Keily","Kyle","Lorin","Makenzy","Makiyah","Michel","Paityn","Penny","Semaj","Sera","Shannen","Tamra","Tayah","Taylore","Tykeria","Aide","Akilah","Alysse","Ambrosia","Anaiya","Anthony","Ariadne","Austin","Chenoa","Daesha","Derricka","Emory","Gianni","Haili","Idalia","Jaelin","Jaileen","Janee","Jazlin","Kacee","Kailie","Keandra","Keilani","Kylea","Laine","Mckinzie","Megha","Myriah","Rhyan","Rochel","Rosanna","Salome","Shaelynn","Shakyra","Tanvi","Tapanga","Vianca","Zakiyah","Zia","Aleia","Armoni","Audriana","Carlin","Carsen","Ceara","Chaney","Chesney","Darci","Elida","Haylea","Jabria","Jaclynn","Jahaira","Jamison","Jeanine","Jeanna","Johannah","Kalin","Kamiya","Kassidi","Katherin","Kaysha","Krislyn","Kymberly","Magan","Marbella","Marwa","Minerva","Nala","River","Seirra","Stefania","Stephani","Toby","Allena","Allisa","Amaia","Anay","Arica","Arieanna","Aviana","Baila","Blaire","Brigette","Caila","Carrigan","Chelsi","Clair","Corrie","Courtnie","Delana","Ema","Glory","Jacelyn","Jordana","Kamia","Katiana","Keianna","Kelby","Laiza","Lilyana","Mahalia","Mallori","Mayah","Molli","Naima","Nola","Raylee","Rayonna","Roslyn","Sean","Shasta","Sirena","Takayla","Takia","Taleah","Tanasia","Tera","Thelma","Vivienne","Adelyn","Alexas","Andreana","Andriana","Aries","Aura","Cayleigh","Dennise","Desarae","Diavian","Elinor","Emeline","Ilse","Jalia","Jonathan","Justyce","Kania","Karely","Katera","Kiani","Kiona","Kirby","Kyia","Lakendra","Maja","Meghana","Naomy","Ramya","Reegan","Rosalba","Shyan","Tanesha","Tiyana","Xenia","Yuri","Zarria","Alaa","Aleesha","Amariah","Amil","Anakaren","Angelle","Arrianna","Ashlan","Augusta","Avigail","Brayden","Brynlee","Campbell","Carmella","Cassey","Cassidi","Deandrea","Gladis","Haydee","Hiba","Jalah","Justin","Kareena","Karol","Kenedy","Maryn","Mica","Mykia","Nailea","Payge","Roselyn","Rylan","Safa","Shakeria","Vy","Adelle","Adyson","Alexes","Amyia","Annabell","Arian","Ariane","Ariela","Briseyda","Carisa","Chanell","Chava","Daryn","Davida","Deidre","Dyani","Esha","Jaide","Kambria","Karishma","Katana","Kellyn","Kyrie","Marcy","Mariann","Marli","Marlyn","Merari","Mikenzie","Naiya","Nana","Orianna","Sabryna","Shaela","Sherri","Simona","Sol","Talitha","Thania","Yailin","Zayra","Aine","Akayla","Alyza","Amoni","Analiese","Arizona","Ashlei","Ashten","Avani","Azure","Bracha","Brina","Caeley","Caren","Cari","Deavion","Delicia","Eleana","Ellery","Emeli","Erinn","Hallee","Jazzmyn","Jules","Kamilah","Karlyn","Kavya","Laysha","Lilyann","Mairead","Mataya","Meera","Meggan","Miriah","Nalani","Ocean","Raechel","Ryanna","Samiyah","Serene","Shakiya","Sianna","Sole","Syeda","Teonna","Tiona","Xitlali","Zeinab","Adamari","Andra","Andrew","Anijah","Areanna","Ashtin","Audry","Calysta","Cheyenna","Cristian","Daejah","Danyel","Della","Erianna","Falon","Fatou","Faythe","Greer","Jacalyn","Jessy","Kaeleigh","Kalissa","Kayana","Keaton","Keelie","Keilah","Kimber","Korie","Lamia","Lenora","Lizett","Londyn","Marleigh","Nadira","Niah","Raychel","Rosio","Shai","Shakia","Sheryl","Shruti","Sumer","Tailor","Venessa","Viola","Ysabel","Zaniya","Addisyn","Adriane","Ameera","Anette","Ayonna","Brittnie","Cate","Celest","Cydnee","David","Denice","Eloisa","Emonie","Graci","Jori","Jubilee","Kaleah","Karrie","Keiry","Kersten","Klara","Latonya","Lexia","Lisbet","Lyndsie","Matthew","Melannie","Mimi","Nyia","Parris","Paulette","Raena","Samiya","Stormi","Takara","Taniah","Taylin","Theodora","Ursula","Vada","Vienna","Zakia","Zena","Aleyna","Anny","Anyah","Arial","Aubri","Caelyn","Chloie","Dacia","Darianna","Deondra","Diandra","Hadiya","Jamilah","Janely","Janey","Joselyne","Keeli","Keiona","Kezia","Kindra","Laina","Latia","Lessly","Mansi","Maris","Melony","Mikenna","Morganne","Nadiyah","Nereida","Nidhi","Nidia","Nyjah","Radhika","Risa","Sable","Sailor","Scout","Shaindy","Solana","Talyn","Tyeisha","Vania","Zuri","Amairani","Anasia","Ashante","Ashlen","Audree","Brandon","Brennan","Caryn","Daelyn","Deserae","Destynee","Deyanira","Emelyn","Emileigh","Eriana","Eternity","Fannie","Heba","Infinity","Iran","Jamaria","Journee","Kaitlan","Karyssa","Kenisha","Khaliah","Kiandra","Kierston","Kylia","Laiken","Laurin","Leela","Lizabeth","Lizbet","Maeghan","Mahnoor","Makia","Marybeth","Meleah","Meriah","Milana","Myracle","Nadiya","Perri","Rosetta","Seana","Shakera","Sunni","Sydne","Symphony","Tamira","Taytum","Vicki","Zaina","Zayda","Ameerah","Annalyse","Apryl","Ariona","Arissa","Arlyn","Aspyn","Ayden","Brett","Brie","Britta","Briyana","Cassi","Catlyn","Corie","Corryn","Courtnee","Danni","Daysia","Delani","Emmalyn","Faviola","Gianella","Gretta","Huda","Iyanla","Jonna","Josalyn","Joshlyn","Kamri","Katey","Kelcey","Kenadi","Kensley","Keosha","Kinzie","Krishna","Krystle","Lakenya","Layna","Lejla","Leonela","Lindsy","Maiah","Makaya","Marrisa","Marsha","Medina","Mei","Millenia","Nija","Nyssa","Rosalina","Sabria","Samaya","Shamaria","Somer","Tajanae","Teah","Teya","Topanga","Unknown","Zada","Aerin","Amairany","Amna","Anaiah","Arion","Arleen","Briyanna","Bryanne","Carolann","Chayla","Daniele","Dayja","Dayonna","Denali","Deven","Devina","Dymon","Eleanore","Elisheva","Hala","Honor","Iqra","Isadora","Jacinta","Jakira","James","Jamiyah","Jayline","Jesslyn","Jonelle","Karalyn","Karenna","Kathya","Kayci","Keelin","Kieara","Kirra","Koryn","Lilyanna","Madigan","Makeda","Malky","Mamie","Margie","Marika","Marlaina","Marquita","Matea","Miesha","Nakiyah","Phyllis","Rivky","Sabra","Shadae","Suzannah","Taija","Takira","Tamaya","Tayana","Tirzah","Tommi","Vianney","Xochilt","Alexxus","Amberlee","Anela","Carah","Carey","Carolyne","Cheyene","Cristy","Damia","Dionne","Edie","Emalie","Ina","Jacklynn","Jaleah","Jalyssa","Jayce","Jesseca","Jessyca","Kasi","Kennadi","Keylee","Kiaya","Kiyanna","Laryssa","Latasia","Leilah","Liset","Madolyn","Makaylee","Mariely","Marrissa","Mazie","Mccall","Meghann","Nayelli","Nicholas","Oksana","Pyper","Rayann","Rida","Shamaya","Shamira","Sharlene","Sheyanne","Skyelar","Tabetha","Teaira","Abria","Adaline","Aishah","Alandra","Aleeya","Alya","Amrita","Anel","Brandee","Breaunna","Breyonna","Caileigh","Calie","Daisia","Delila","Deseree","Devynn","Diamon","Elma","Emelie","Endia","Ezra","Hanan","Haneen","Hawa","Ila","Israel",
    "Jacob","Michael","Matthew","Joshua","Nicholas","Andrew","Joseph","Daniel","Tyler","William","Brandon","Ryan","John","Zachary","David","Anthony","James","Justin","Jonathan","Austin","Dylan","Ethan","Benjamin","Noah","Samuel","Robert","Nathan","Cameron","Kevin","Thomas","Jose","Hunter","Jordan","Kyle","Caleb","Jason","Logan","Aaron","Eric","Brian","Gabriel","Adam","Jack","Isaiah","Juan","Luis","Connor","Charles","Elijah","Isaac","Steven","Evan","Jared","Sean","Timothy","Luke","Cody","Alex","Seth","Mason","Richard","Carlos","Angel","Patrick","Devin","Bryan","Cole","Jackson","Ian","Garrett","Trevor","Jesus","Chase","Adrian","Mark","Blake","Antonio","Lucas","Jeremy","Gavin","Miguel","Julian","Dakota","Jesse","Dalton","Bryce","Tanner","Kenneth","Stephen","Jake","Victor","Spencer","Marcus","Paul","Brendan","Jeremiah","Xavier","Jeffrey","Tristan","Jalen","Jorge","Edward","Riley","Wyatt","Colton","Joel","Maxwell","Aidan","Travis","Shane","Colin","Dominic","Carson","Vincent","Derek","Oscar","Grant","Eduardo","Peter","Henry","Parker","Hayden","Collin","George","Bradley","Mitchell","Devon","Ricardo","Shawn","Taylor","Nicolas","Gregory","Liam","Kaleb","Preston","Erik","Alexis","Owen","Omar","Diego","Dustin","Corey","Fernando","Clayton","Carter","Ivan","Jaden","Javier","Alec","Scott","Manuel","Cristian","Alan","Raymond","Brett","Max","Andres","Gage","Mario","Dawson","Dillon","Cesar","Wesley","Levi","Jakob","Chandler","Martin","Malik","Edgar","Trenton","Sergio","Josiah","Nolan","Marco","Peyton","Harrison","Hector","Micah","Roberto","Drew","Brady","Erick","Conner","Jonah","Casey","Jayden","Emmanuel","Edwin","Andre","Phillip","Brayden","Landon","Giovanni","Bailey","Ronald","Braden","Damian","Donovan","Ruben","Frank","Pedro","Gerardo","Andy","Chance","Abraham","Calvin","Trey","Cade","Donald","Derrick","Payton","Darius","Enrique","Keith","Raul","Jaylen","Troy","Jonathon","Cory","Marc","Skyler","Rafael","Trent","Griffin","Colby","Johnny","Eli","Chad","Armando","Kobe","Caden","Cooper","Marcos","Elias","Brenden","Israel","Avery","Zane","Dante","Josue","Zackary","Allen","Mathew","Dennis","Leonardo","Ashton","Philip","Julio","Miles","Damien","Ty","Gustavo","Drake","Jaime","Simon","Jerry","Curtis","Kameron","Lance","Brock","Bryson","Alberto","Dominick","Jimmy","Kaden","Douglas","Gary","Brennan","Zachery","Randy","Louis","Larry","Nickolas","Tony","Albert","Fabian","Keegan","Saul","Danny","Tucker","Damon","Myles","Arturo","Corbin","Deandre","Ricky","Lane","Pablo","Darren","Zion","Jarrett","Alfredo","Micheal","Angelo","Carl","Oliver","Kyler","Tommy","Walter","Dallas","Jace","Quinn","Theodore","Grayson","Lorenzo","Joe","Arthur","Bryant","Brent","Roman","Russell","Ramon","Lawrence","Moises","Aiden","Quentin","Tyrese","Jay","Tristen","Emanuel","Salvador","Terry","Morgan","Jeffery","Esteban","Tyson","Braxton","Branden","Brody","Craig","Marvin","Ismael","Rodney","Isiah","Maurice","Marshall","Ernesto","Emilio","Brendon","Kody","Eddie","Malachi","Abel","Keaton","Jon","Shaun","Skylar","Nikolas","Ezekiel","Santiago","Kendall","Axel","Camden","Trevon","Bobby","Conor","Jamal","Lukas","Malcolm","Zackery","Jayson","Javon","Reginald","Desmond","Roger","Felix","Dean","Quinton","Ali","Davis","Gerald","Rodrigo","Billy","Rene","Reece","Justice","Kelvin","Leo","Chris","Kevon","Steve","Clay","Weston","Dorian","Hugo","Orlando","Roy","Terrance","Kai","Khalil","Graham","Noel","Willie","Terrell","Tyrone","Camron","Mauricio","Amir","Darian","Jarod","Nelson","Kade","Reese","Kristian","Garret","Marquis","Rodolfo","Dane","Felipe","Todd","Elian","Walker","Mateo","Jaylon","Kenny","Bruce","Ezra","Ross","Damion","Francis","Tate","Byron","Reid","Warren","Randall","Bennett","Jermaine","Triston","Jaquan","Harley","Jessie","Franklin","Duncan","Charlie","Reed","Blaine","Braeden","Holden","Ahmad","Issac","Kendrick","Melvin","Sawyer","Solomon","Moses","Jaylin","Sam","Cedric","Mohammad","Alvin","Beau","Jordon","Elliot","Lee","Darrell","Jarred","Mohamed","Davion","Wade","Tomas","Jaxon","Uriel","Deven","Rogelio","Gilberto","Ronnie","Julius","Allan","Brayan","Deshawn","Joey","Terrence","Noe","Alfonso","Ahmed","Tyree","Tyrell","Jerome","Devan","Neil","Ramiro","Pierce","Davon","Devonte","Jamie","Leon","Adan","Eugene","Stanley","Marlon","Quincy","Leonard","Wayne","Will","Alvaro","Ernest","Harry","Addison","Ray","Alonzo","Jadon","Jonas","Keyshawn","Rolando","Mohammed","Tristin","Donte","Leonel","Wilson","Gilbert","Coby","Dangelo","Kieran","Colten","Keenan","Koby","Jarrod","Dale","Harold","Toby","Dwayne","Elliott","Osvaldo","Cyrus","Kolby","Sage","Coleman","Declan","Adolfo","Ariel","Brennen","Darryl","Trace","Orion","Shamar","Efrain","Keshawn","Rudy","Ulises","Darien","Braydon","Ben","Vicente","Nasir","Dayton","Joaquin","Karl","Dandre","Isaias","Rylan","Sterling","Cullen","Quintin","Stefan","Brice","Lewis","Gunnar","Humberto","Nigel","Alfred","Agustin","Asher","Daquan","Easton","Jaron","Ralph","Everett","Hudson","Marquise","Tobias","Glenn","Antoine","Jasper","Elvis","Kane","Sidney","Ezequiel","Tylor","Aron","Dashawn","Devyn","Mike","Silas","Jaiden","Jayce","Deonte","Romeo","Deon","Freddy","Kurt","Kolton","River","August","Roderick","Clarence","Derick","Jamar","Raphael","Rohan","Kareem","Muhammad","Demarcus","Sheldon","Markus","Cayden","Luca","Tre","Jamison","Jean","Rory","Brad","Clinton","Jaylan","Titus","Emiliano","Jevon","Julien","Alonso","Lamar","Cordell","Gordon","Ignacio","Jett","Keon","Baby","Cruz","Rashad","Tariq","Armani","Deangelo","Milton","Geoffrey","Elisha","Moshe","Bernard","Asa","Bret","Darion","Darnell","Izaiah","Irvin","Jairo","Howard","Aldo","Ayden","Garrison","Norman","Stuart","Kellen","Travon","Shemar","Dillan","Junior","Darrius","Rhett","Barry","Kamron","Jude","Amari","Jovan","Octavio","Perry","Kole","Misael","Hassan","Jaren","Latrell","Roland","Quinten","Ibrahim","Justus","German","Gonzalo","Nehemiah","Forrest","Anton","Chaz","Talon","Austen","Brooks","Conrad","Greyson","Winston","Antwan","Dion","Lincoln","Leroy","Earl","Jaydon","Landen","Gunner","Brenton","Fredrick","Kurtis","Stephan","Stone","Shannon","Shayne","Karson","Stephon","Nestor","Frankie","Gianni","Keagan","Tristian","Dimitri","Kory","Zakary","Donavan","Draven","Jameson","Clifton","Daryl","Emmett","Cortez","Destin","Jamari","Dallin","Estevan","Grady","Davin","Santos","Marcel","Carlton","Dylon","Mitchel","Clifford","Syed","Adonis","Dexter","Keyon","Reynaldo","Devante","Arnold","Clark","Kasey","Sammy","Thaddeus","Glen","Jarvis","Garett","Infant","Keanu","Kenyon","Nick","Ulysses","Dwight","Kent","Denzel","Lamont","Houston","Layne","Darin","Jorden","Anderson","Kayden","Khalid","Antony","Deondre","Ellis","Marquez","Ari","Austyn","Brycen","Abram","Braedon","Reuben","Hamza","Ryder","Zaire","Terence","Guy","Jamel","Tevin","Jordy","Kelly","Porter","Trever","Dario","Jackie","Judah","Keven","Raymundo","Josef","Paris","Colt","Rahul","Savion","Deshaun","Josh","Korey","Gerard","Jacoby","Lonnie","Reilly","Seamus","Don","Giovanny","Jamil","Samir","Benny","Dominik","Finn","Jan","Cale","Irving","Jaxson","Kaiden","Marcelo","Nico","Rashawn","Vernon","Aubrey","Gaven","Jabari","Sincere","Kirk","Maximus","Mikel","Davonte","Heath","Justyn","Kadin","Alden","Kelton","Brandan","Courtney","Camren","Dewayne","Darrin","Darrion","Duane","Elmer","Maverick","Nikhil","Sonny","Abdullah","Chaim","Nathen","Bronson","Xzavier","Efren","Jovani","Phoenix","Reagan","Blaze","Luciano","Royce","Tyrek","Tyshawn","Deontae","Fidel","Gaige","Aden","Neal","Ronaldo","Gideon","Prince","Rickey","Deion","Denver","Benito","London","Matteo","Samson","Bernardo","Raven","Simeon","Turner","Carlo","Gino","Johan","Ryley","Domenic","Hugh","Rocky","Trystan","Emerson","Trevion","Joan","Marques","Raheem","Tyreek","Vaughn","Clint","Nash","Mariano","Myron","Ladarius","Lloyd","Omari","Keshaun","Pierre","Rick","Xander","Eliseo","Jeff","Bradly","Freddie","Kavon","Mekhi","Shea","Dan","Adrien","Isai","Kian","Paxton","Rasheed","Blaise","Brodie","Donnie","Isidro","Jaeden","Javion","Jimmie","Johnnie","Kennedy","Tyrique","Andreas","Augustus","Jalon","Jamir","Valentin","Korbin","Lawson","Maxim","Fred","Herbert","Amos","Bruno","Donavon","Javonte","Ean","Kamren","Rowan","Alek","Brandyn","Demarco","Hernan","Bo","Branson","Brennon","Genaro","Jamarcus","Aric","Barrett","Rey","Braiden","Brant","Dontae","Harvey","Jovany","Kale","Nicklaus","Zander","Dillion","Donnell","Kylan","Treyvon","Vincenzo","Dayne","Isaak","Jaleel","Lionel","Tracy","Giovani","Tavian","Darwin","Tyron","Dequan","Ishmael","Juwan","Mustafa","Raekwon","Ronan","Truman","Jensen","Yousef","Bridger","Jelani","Markel","Zack","Zavier","Alijah","Clyde","Devonta","Jarett","Joseluis","Keandre","Kenton","Santino","Semaj","Montana","Tyreke","Vance","Yosef","Niko","Trae","Uriah","Floyd","Gavyn","Haden","Killian","Loren","Madison","Tyreese","Cain","Gregorio","Leslie","Lester","Luc","Tyquan","Alton","Braulio","Jakobe","Lazaro","Leland","Robin","Tye","Vladimir","Abdul","Immanuel","Kerry","Markell","Zain","Adriel","Rhys","Rylee","Anders","Bilal","Fletcher","Jacquez","Jade","Treyton","Blayne","Coleton","Hakeem","Harris","Daron","Elvin","Hans","Waylon","Cecil","Jovanny","Trenten","Britton","Dyllan","Jacques","Jair","Jordyn","Shelby","Brandt","Campbell","Dajuan","Eliezer","Gannon","Jonatan","Konnor","Mauro","Tavon","Trevin","Coy","Darrian","Dionte","Hezekiah","Jovanni","Lars","Oswaldo","Trayvon","Herman","Jayvon","Kyree","Leif","Milo","Rico","Daveon","Erich","Layton","Menachem","Sydney","Johnpaul","Santana","Arjun","Arman","Bradford","Dakotah","Kalob","Ken","Tavion","Zayne","Demond","Edmund","Gene","Jarret","Tahj","Taj","Arron","Bishop","Daylon","Ethen","Jedidiah","Konner","Payne","Sahil","Yusuf","Ameer","Ervin","Jaquez","Jase","Javen","Jaycob","Kahlil","Kalen","Rayshawn","Tyriq","Aditya","Cannon","Eddy","Everardo","Jim","Dashaun","Devontae","Dusty","Hasan","Jericho","Kalvin","Rocco","Dejuan","Jerrod","Stewart","Brannon","Galen","Geovanni","Jalin","Jaret","Milan","Neo","Slade","Bowen","Caiden","Franco","Armand","Bill","Dejon",
    "Fredy","Kolten","Wilfredo","Benton","Dana","Edgardo","Jajuan","Jalil","Jalyn","Jerod","Keelan","Yisroel","Abner","Demonte","Enzo","Kyron","Luiz","Rex","Varun","Darrien","Johnson","Kegan","Marcello","Mckinley","Obed","Denis","Eleazar","Federico","Jamaal","Kobie","Matthias","Quinlan","Ramsey","Deante","Dustyn","Messiah","Notnamed","Randolph","Baylor","Dameon","Enoch","Louie","Sherman","Theron","Ammon","Blair","Chauncey","Codey","Daren","Jordi","Willis","Cedrick","Jerimiah","Keshon","Shelton","Ajay","Auston","Camryn","Kain","Kenan","Presley","Stetson","Tayler","Aman","Desean","Dezmond","Kentrell","Nevin","Ryland","Shlomo","Timmy","Yehuda","Dorien","Morris","Bryon","Caelan","Dakoda","Kendell","Kobi","Leighton","Luther","Marion","Pranav","Travion","Trinity","Briar","Chester","Claudio","Devlin","Ira","Jadyn","Long","Lyle","Mikael","Tai","Theo","Canyon","Chace","Demetri","Deric","Justen","Naseem","Robbie","Tyrus","Wendell","Yash","Arian","Armon","Claude","Jacky","Malique","Mohamad","Pete","Sameer","Teagan","Tom","Treveon","Wallace","Braylon","Cason","Devion","Erin","Foster","Karsten","Keion","Mickey","Osbaldo","Damarcus","Jai","Jarren","Kollin","Marquel","Otis","Ryker","Storm","Ted","Anakin","Dave","Elton","Emory","Jihad","Kamari","Kason","Martez","Willem","Angus","Blade","Gerson","Iain","Jaelen","Javan","Kendal","Nicklas","Rian","Ron","Domingo","Isreal","Jacobi","Javin","Leandro","Matias","Tarik","Wilmer","Bradon","Canaan","Darrick","Edson","Ephraim","Favian","Griffen","Mack","Sami","Samual","Shay","Damani","Davian","Dilan","Ely","Horacio","Jashawn","Karim","Keonte","Montrell","Rohit","Anish","Babyboy","Erwin","Jaedon","Mathias","Rashaad","Tim","Yaakov","Zaid","Avi","Daylen","Edmond","Giuseppe","Jagger","Karon","Marty","Niklas","Tyre","Yitzchok","Antwon","Arnulfo","Emil","Jarius","Kodi","Shimon","Teddy","Brayton","Cal","Jermiah","Jullian","Marcell","Tyrik","Zeke","Amar","Daylan","Garry","Hussein","Jaylyn","Job","Rashaun","Reyes","Tory","Tyrin","Vince","Atticus","Aurelio","Brantley","Case","Damonte","Daunte","Dax","Donavin","Finnegan","Kamal","Kohl","Landry","Laron","Luka","Monte","Nazir","Parth","Shaquan","Skye","Bradyn","Eloy","Fisher","Gabe","Jadin","Jordin","Keondre","Keontae","Lucio","Marlin","Mikal","Paolo","Rishi","Savon","Sullivan","Bryton","Codie","Dajon","Jerrell","Judson","Maxx","Ramses","Reggie","Ronny","Shmuel","Spenser","Van","Boston","Chayton","Emery","Forest","Marko","Miller","Roel","Schuyler","Soren","Ashley","Colter","Dereck","Hank","Harlan","Jered","Keoni","Muhammed","Ridge","Tyran","Arik","Avraham","Blane","Dalen","Jessy","Khari","Mykel","Anson","Cy","Delano","Delvin","Ever","Izaak","Jadan","Jody","Jovon","Kaelan","Nikolai","Callum","Camilo","Chadwick","Dedrick","Deonta","Dru","Eamon","Gareth","Garrick","Greg","Isac","Izayah","Jacorey","Jalan","Joesph","Joshuah","Kamden","Lyndon","Neel","Regan","Rodrick","Sabian","Tommie","Tremaine","Arnoldo","Edison","Haydn","Jakari","Jamon","Mahmoud","Marquan","Osman","Rashard","Tyshaun","Adin","Akeem","Brogan","Cash","Derian","Geovanny","Hayes","Jess","Konrad","Leobardo","Mathieu","Maximo","Benson","Broc","Coltin","Eliot","Flavio","Izak","Jakub","Klayton","Raj","Scotty","Corban","Domonic","Donta","Gian","Kelby","Lazarus","Maleek","Najee","Nikko","Raquan","Sky","Tylan","Abdiel","Deacon","Demario","Diondre","Donny","Hagen","Jailen","Jarek","Jerald","Jeramiah","Kamryn","King","Kye","Malek","Quenton","Quran","Richie","Rosendo","Shivam","Tylar","Tyren","Ammar","Avrohom","Beck","Brigham","Darron","Esau","Issiah","Jaelin","Jax","Johann","Kirby","Mikhail","Norberto","Shiloh","Taron","Westin","Yovani","Ashwin","Gauge","Haven","Jahlil","Langston","Nikolaus","Noa","Rayquan","Rowdy","Rudolph","Rusty","Salomon","Sunny","Youssef","Akash","Amani","Darrel","Dhruv","Hiram","Ishan","Jarrell","Jayquan","Laurence","Marshal","Remy","Adnan","Baron","Brevin","Denton","Izaac","Jed","Justis","Leopoldo","Randal","Tremayne","Vivek","Armond","Bennie","Carsen","Cian","Cornell","Daulton","Fermin","Jacobo","Jamarius","Javian","Kenyatta","Merrick","Michal","Octavius","Rami","Takoda","Yonatan","Aries","Blaize","Bradlee","Daven","Davontae","Donell","Earnest","Eden","Garren","Ismail","Jairus","Jameel","Jarell","Kiernan","Kolbe","Paulo","Tyrel","Akshay","Cauy","Ceasar","Deron","Devaughn","Dino","Edwardo","Eriberto","Isacc","Kacey","Stefano","Vito","Wilbert","Zacary","Adarius","Carmen","Denny","Dontrell","Hogan","Kevyn","Kolin","Lathan","Masen","Virgil","Zyon","Andru","Benjamen","Brandin","Ernie","Haiden","Isaih","Jawan","Jaysen","Kalib","Kesean","Manav","Mckay","Montez","Palmer","Vikram","Westley","Yoel","Amado","Basil","Coty","Daxton","Deshon","Dyllon","Jadarius","Jakeb","Jourdan","Kaine","Neftali","Nikola","Niles","Treshawn","Trinidad","Vincente","Abhishek","Andrey","Augustin","Avante","Daevon","Jamin","Tashawn","Tavis","Tobin","Aldair","Alphonso","Dmitri","Kainoa","Kelsey","Kordell","Lenny","Michel","Race","Rio","Tallon","Tayvon","Torin","Vidal","Aedan","Ajani","Benedict","Corwin","Davonta","Deaundre","Homero","Jaydin","Jeffry","Kalil","Kamil","Kellan","Luigi","Otto","Ronin","Zahir","Akhil","Calen","Cassius","Chazz","Clemente","Erasmo","Horace","Jeron","Kirkland","Kyran","Lavon","Lucian","Stacy","Ulisses","Wanya","Willard","Alen","Aramis","Caeden","Cameren","Chasen","Domenico","Hyrum","Jasen","Jonathen","Kevonte","Kymani","Malcom","Marley","Terell","Trysten","Abelardo","Anas","Brando","Caesar","Chevy","Corbyn","Derik","Diante","Franky","Mac","Mckenzie","Nikita","Ravi","Reymundo","Sanjay","Tevon","Antione","Arath","Artemio","Corben","Damen","Danilo","Danthony","Dayvon","Demitri","Dovid","Evin","Hamilton","Humza","Jaquon","Karter","Osmar","Patricio","Raymon","Reno","Romello","Scottie","Shayan","Terrion","Waleed","Zavion","Andrei","Aydan","Boris","Danial","Demarius","Divine","Hilario","Isael","Jayton","Jet","Keller","Kodie","Kris","Kylen","Renato","Renzo","Sharif","Zach","Zacharia","Amin","Bjorn","Burke","Cohen","Daryn","Duke","Elan","Eriq","Hadi","Hubert","Kadarius","Kamran","Kejuan","Lake","Lowell","Maison","Major","Omer","Quadir","Roshan","Ryne","Saif","Shaan","Slater","Stevie","Tyshon","Umar","Ace","Ahmir","Al","Alain","Amit","Cobe","Creed","Daequan","Damarius","Jory","Jules","Keyshaun","Kwame","Maguire","Nate","Osama","Tamir","Uziel","Wiley","Baily","Cary","Colson","Cort","Damari","Drayton","Jacobe","Jacolby","Jaelon","Jarin","Khaled","Lashawn","Murphy","Rayvon","Rigo","Saad","Salman","Shad","Shakur","Taquan","Tavares","Tryston","Ulices","Codi","Cormac","Cyril","Davante","Dayshawn","Eugenio","Ford","Garet","Hakim","Jacari","Jacen","Jansen","Javeon","Kalani","Kenji","Kishan","Lucien","Makai","Naim","Steele","Tyjuan","Andrea","Baltazar","Carmelo","Chet","Esequiel","Faisal","Javontae","Jeremias","Khalif","Khyree","Kiran","Laquan","Manny","Micaiah","Musa","Mykal","Percy","Rashid","Rayan","Shiv","Wolfgang","Yusef","Zev","Akil","Alexi","Archie","Aryeh","Canon","Chantz","Chayse","Desmon","Eathan","Eder","Eian","Esai","Filip","Heber","Jerrick","Jhonatan","Juston","Karan","Krystian","Lamonte","Lemuel","Nabil","Naquan","Osiel","Robby","Royal","Saige","Thor","Zebulon","Zeth","Aram","Avion","Ayman","Baylee","Channing","Christen","Cyle","Daemon","Dakari","Demetrio","Derrion","Errol","Ezekial","Flynn","Gabino","Henri","Imanol","Ishaan","Jaelyn","Jasiah","Kanyon","Kasen","Kunal","Lynn","Massimo","Matheus","Natanael","Pierson","Terron","Tristyn","Willy","Yair","Zamir","Alexei","Amador","Anibal","Bladimir","Cheyenne","Dade","Dain","Dalvin","Damond","Dashon","Demetris","Dontay","Drevon","Eliyahu","Gavan","Genesis","Gibson","Haris","Jakobi","Jashaun","Jerad","Jerardo","Kaeden","Kayne","Kobey","Kylar","Lauro","Levon","Linus","Marshawn","Matt","Migel","Noble","Oakley","Oren","Pavel","Raleigh","Stevan","Suraj","Taran","Tarek","Terrel","Titan","Tyus","Vishal","Williams","Yonathan","Zakery","Zuriel","Abhinav","Abran","Alston","Anwar","Arion","Aydin","Breon","Christan","Cutter","Dallen","Dylen","Faustino","Geno","Gil","Giovany","Hampton","Harper","Jasean","Jayshawn","Karsen","Keishawn","Kendric","Lennon","Lucky","Magnus","Mateusz","Montel","Nino","Paden","Rashon","Reinaldo","Sachin","Servando","Shae","Trequan","Ubaldo","Yasin","Zakaria","Antonino","Arya","Derrell","Donaven","Eldon","Emir","Emmet","Fausto","Gabrial","Graeme","Jaedan","Mervin","Rickie","Said","Sedrick","Sloan","Stacey","Taye","Xaiver","Yakov","Alfonzo","Aris","Asad","Aspen","Caine","Daylin","Dominque","Dov","Elie","Gamaliel","Hamzah","Jerred","Jiovanni","Jonte","Kalin","Malaki","Martell","Meir","Rakeem","Reis","Romel","Rony","Sione","Skylor","Tahir","Tayton","Wylie","Adrain","Aj","Amadou","Brendyn","Charley","Christos","Cristo","Dekota","Diamond","Dirk","Geronimo","Greggory","Jad","Jesiah","Jevin","Kelan","Lucus","Marquese","Merlin","Naeem","Nahum","Napoleon","Nile","Romero","Saxon","Shamus","Shareef","Shon","Torrey","Trayton","Tywan","Tzvi","Wilber","Armaan","Brysen","Carsten","Cross","Damir","Dayon","Deontay","Dondre","Eliud","Emmitt","Frederic","Gatlin","Izaya","Jashon","Javonta","Jawaun","Jeanpaul","Jomar","Kedrick","Kekoa","Korben","Krishna","Laith","Mamadou","Markeith","Nicola","Oziel","Ransom","Rayden","Seven","Taha","Tatum","Tayvion","Teodoro","Thai","Tyrece","Tysean","Yahya","Zarek","Aharon","Armin","Calob","Cassidy","Cayman","Chayce","Daeshawn","Dasean","Dijon","Everette","Fischer","Grey","Gus","Ilan","Jarom","Jeramy","Jhon","Kevan","Lino","Mahdi","Nashawn","Odin","Rylie","Sammuel","Shamir","Syncere","Tamar","Tyriek","Vijay","Vishnu","Wilfred","Abdallah","Ambrose","Antone","Arnav","Aziz","Barron","Boyd","Braylen","Briggs","Bryar","Che","Ciaran","Daivon","Dalyn","De","Dev","Finnian","Gerrit","Gregg","Imani","Jabril","Jamell","Jarid","Jawon","Jaykob","Joao","Karthik","Kashawn","Maceo","Mayson","Nabeel","Perrion","Quan","Ryen","Shreyas","Sutton","Syrus","Tiernan","Trajan","Trentin","Yasir","Yehoshua","Zacharie","Zayd","Zyaire","Abimael","Anand","Baxter","Briley","Buddy","Cage","Carey","Carlin","Daiquan","Darby","Darell","Darious",
    "Derrik","Djuan","Eitan","Elio","Garland","Imran","Jaymes","Jeb","Jeromy","Jeshua","Kage","Kaylon","Kayvon","Keilan","Kennith","Kile","Lavonte","Logen","Osiris","Porfirio","Quin","Randell","Raziel","Rondell","Roque","Rueben","Surya","Terran","Tysen","Wil","Akiva","Amer","Andrue","Anirudh","Anthoney","Aryan","Avonte","Bentley","Bodie","Casper","Charlton","Cortland","Daijon","Dathan","Demari","Drequan","Dyson","Edmundo","Eliazar","Enrico","Exavier","Franklyn","Geraldo","Giorgio","Gray","Jayme","Jonny","Kimani","Kyren","Lachlan","Lamarcus","Marquell","Mikah","Oskar","Ozzy","Parrish","Sedric","Stockton","Tavaris","Thane","Torrance","Traveon","Treston","Trystin","Tymir","Unknown","Ameen","Anfernee","Aren","Athan","Blain","Blas","Carmine","Celso","Dakarai","Dariel","Daymon","Dedric","Donivan","Eben","Eoin","Finley","Fox","Freeman","Gianluca","Irwin","Ivory","Izac","Jacinto","Jakoby","Jamarion","Jasson","Jaydan","Josias","Keshun","Kevion","Kiel","Kush","Lakota","Larson","Nicolo","Orrin","Pascual","Patryk","Philippe","Saeed","Sandro","Shamari","Shan","Shyheim","Talha","Teon","Thad","Tyreik","Valente","Aamir","Akira","Amon","Andruw","Antoni","Arlo","Azariah","Bayley","Brenan","Chanse","Chas","Daquon","Dasani","Demarion","Deshun","Deveon","Devontay","Domanic","Elbert","Ethyn","Gavriel","Gorge","Isaiha","Jabriel","Jahleel","Jahmir","Jathan","Johnatan","Kadyn","Kayleb","Kc","Kyson","Maliq","Mihir","Mikeal","Mitch","Nathon","Niall","Patric","Raequan","Raiden","Randon","Rithvik","Rojelio","Romario","Stanton","Tyce","Unique","Xavion","Zaine","Amaan","Callahan","Camrin","Carlito","Dagan","Davien","Dezmon","Doyle","Elyjah","Ewan","Farhan","Faris","Hanson","Iverson","Jacory","Jafet","Jarad","Jaryd","Jashua","Jerico","Kamrin","Karlos","Keeton","Landyn","Marek","Nadir","Nasim","Orin","Rayce","Rees","Russel","Ryon","Sampson","Sasha","Stefon","Tiger","Torian","Tray","Treven","Viktor","Adryan","Alpha","Anuj","Arden","Asael","Beckett","Brenner","Calum","Cameran","Ciro","Dayquan","Demetric","Demontae","Derrian","Diamante","Diontae","Dixon","Domenick","Eusebio","Gaspar","Gentry","Iman","Isa","Jaiquan","Jamall","Jarron","Javaris","Jedediah","Joeseph","Jquan","Kael","Kennan","Kofi","Laine","Leander","Leandre","Maxfield","Maximino","Mendel","Modesto","Obadiah","Pasquale","Prestin","Ronak","Rufus","Ryu","Tenzin","Terrill","Timmothy","Tj","Tyvon","Vinh","Anthonie","Ashtin","Brendin","Britt","Calder","Cavan","Chaise","Christ","Cj","Cobey","Collins","Curt","Delon","Delvon","Geovany","Graydon","Hadley","Hasani","Haydon","Hilton","Jaedyn","Jahari","Jamario","Jamere","Jarel","Javante","Javaughn","Jc","Jerell","Kabir","Kagan","Khaleel","Kingsley","Kylin","Kylon","Levar","Lisandro","Lucca","Markese","Mikell","Miquel","Nolen","Pacey","Rece","Rodger","Taevon","Tavin","Taylon","Torey","Vinay","Yaseen","Yitzchak","Zak","Zaki","Adal","Andrez","Antwain","Armen","Armondo","Arun","Ayush","Azriel","Baruch","Boone","Brighton","Brook","Brooklyn","Cobi","Curran","Deontre","Derrek","Desi","Dillen","Dimas","Donato","Eliott","Esdras","Fabio","Fahad","Halen","Jaidon","Jaleen","Jamonte","Jareth","Javarius","Jawuan","Jeremie","Jerrett","Jerson","Jontae","Kamar","Kayson","Keagen","Keifer","Keshav","Keyvon","Kingston","Korbyn","Mika","Monty","Nader","Nasser","Nicolaus","Olivier","Rashaud","Rhyan","Rion","Roscoe","Rubin","Samer","Tait","Trevian","Tylen","Tyric","Xavian","Yechiel","Yobani","Zachory","Zakkary","Arvin","Ashish","Binyomin","Braedyn","Brison","Brodey","Brodrick","Cael","Charly","Cisco","Coleson","Collier","Colyn","Delbert","Dewey","Edgard","Eion","Elder","Elijiah","Evans","Eyan","Geovani","Gildardo","Hershel","Hosea","Ibraheem","Jahaziel","Jeanluc","Jennifer","Jerron","Joshue","Justine","Keivon","Kiefer","Landin","Male","Marlo","Natan","Nevan","Norris","Payson","Ramone","Robinson","Romell","Salem","Sammie","Shalom","Taylen","Tayshaun","Tegan","Tito","Torrence","Treshaun","Treshon","Yousuf","Zen","Adair","Adel","Adison","Arin","Bob","Brecken","Brion","Brockton","Dajour","Dietrich","Dmarco","Edin","Eladio","Elam","Emile","Fredi","Haley","Hollis","Hussain","Ike","Jadakiss","Jaxen","Jayland","Jayven","Jhonny","Kacper","Keldrick","Kelley","Kevontae","Keylan","Khaliq","Kieron","Lavar","Mahlon","Malakai","Marino","Naythan","Nikolaos","Nima","Octavian","Olin","Otoniel","Rakim","Renee","Satchel","Selvin","Sylas","Tad","Taurus","Tayshawn","Tejas","Traven","Travonte","Tynan","Yamil","Zavian","Zeus","Asante","Boaz","Brien","Cameryn","Chason","Collyn","Daishawn","Decker","Delton","Demarkus","Devine","Dmarcus","Edrick","Emily","Eryk","Haroon","Hashim","Ibrahima","Jailyn","Jakeem","Jeriah","Jessi","Jonpaul","Jozef","Jr","Kadeem","Kallen","Kase","Kavin","Keontay","Keyonte","Kwesi","Legend","Leondre","Leron","Lex","Leyton","Makhi","Matthews","Maxton","Minh","Monroe","Naftali","Nicolai","Nomar","Parris","Payten","Quenten","Rahsaan","Ramy","Richmond","Rosario","Seneca","Shakeem","Sherrod","Tanis","Tuan","Tylon","Tyreece","Tyrelle","Ulyses","Usman","Vinson","Zaquan","Abbas","Abe","Alaric","Alix","Aly","Amonte","Amr","Anthoni","Archer","Armoni","Bladen","Brallan","Bretton","Callan","Chavez","Coley","Daegan","Damar","Damein","Deep","Derric","Domonick","Donavyn","Edvin","Eros","Germaine","Harmon","Ibn","Idris","Iran","Isaah","Isak","Jacobie","Jacori","Jahvon","Jaidyn","Jaison","Jaycee","Jeremey","Jibril","Jobe","Juaquin","Kamau","Kaseem","Kasper","Kavan","Keevon","Kelvon","Keron","Kraig","Lauren","Lavelle","Lawton","Marius","Maxime","Maynor","Mehki","Mychael","Nakia","Nassir","Nils","Price","Quincey","Rahim","Raynard","Rayshaun","Rufino","Saleem","Salim","Sergey","Sven","Taveon","Taylan","Teron","Thien","Thompson","Trejon","Walid","Warner","Wilbur","Xavior","Yazan","Zade","Aakash","Adham","Adil","Adithya","Adriano","Anil","Bennet","Brain","Chadrick","Christin","Clement","Cliff","Conley","Dacoda","Dadrian","Daimon","Darek","Darryn","Davaughn","Dayvion","Decarlos","Delmar","Detrick","Dionicio","Dusten","Edan","Gavon","Harsh","Issaiah","Jacy","Jahmal","Jarrid","Javien","Jawad","Jaymin","Johny","Jun","Kannon","Kasim","Kenya","Keyshon","Klay","Kong","Lucius","Lyric","Maliek","Martel","Micha","Murad","Nainoa","Nazareth","Noam","Ocean","Ravon","Reuven","Ruvim","Samad","Scot","Shaheem","Talib","Taven","Tramaine","Treyson","Vittorio","Yael","Zyan","Adian","Adrean","Andrae","Ansel","Anselmo","Avinash","Bijan","Boruch","Broden","Cadence","Callen","Casen","Daejon","Damarco","Dashiell","Dawsen","Delaney","Delfino","Demonta","Efraim","Fidencio","Gaetano","Gehrig","Graysen","Heston","Issa","Jaziel","Jessica","Journey","Judd","Kaelin","Kani","Keonta","Kip","Koltin","Ky","Landis","Lenin","Lennox","Maalik","Makel","Marcial","Nevada","Nicky","Nosson","Pearce","Pearson","Prentice","Presten","Qasim","Rayne","Ronnell","Rosalio","Rustin","Scout","Shaine","Shakir","Shyam","Stratton","Talen","Tayden","Teague","Traevon","Tyon","Andi","Anjel","Blakely","Bram","Bryden","Chadd","Chanler","Collen","Dalan","Damario","Danyel","Daveion","Dylin","Eliel","Elija","Frantz","Garron","Gaurav","Gerry","Giovonni","Huy","Imari","Indiana","Isiaha","Jae","Jaeger","Japheth","Jaryn","Jazz","Jerel","Jeric","Jermey","Jeronimo","Jestin","Juliano","Keanan","Kincaid","Kyrin","Landan","Laramie","Mahad","Markos","Mattias","Mayer","Mccoy","Mehdi","Meyer","Morgen","Naji","Naveen","Phineas","Prem","Quest","Raghav","Rider","Rishabh","Sagar","Saleh","Sanchez","Sarah","Schyler","Shai","Shamel","Shandon","Silvio","Smith","Tremon","Trevan","Trevis","Treylon","TRUE","Tywon","Wes","Zachari","Zeb","Adler","Ankit","Antwone","Argenis","Arnaldo","Arvind","Ashten","Augusto","Avian","Bakari","Baker","Baldemar","Bernabe","Braedan","Braydan","Braylin","Cairo","Candido","Carnell","Cecilio","Cobie","Conan","Conlan","Cosme","Crispin","Dacota","Dameion","Dayveon","Deaven","Demon","Denilson","Derrius","Derron","Destiny","Dilon","Domanick","Dre","Egan","Elijha","Esteven","Evaristo","Fadi","Gaston","Gautam","Graden","Hannah","Hansel","Herson","Holland","Igor","Iram","Isayah","Izaiha","Iziah","Jaidan","Jailon","Jaivon","Jaycen","Jayveon","Jermain","Jvon","Kaelen","Kaylan","Kaylen","Keenen","Keeshawn","Keishaun","Keishon","Kelson","Kenyan","Kion","Koen","Larkin","Larsen","Lavell","Lev","Marshaun","Merle","Murray","Mykah","Nafis","Naseer","Nixon","Obinna","Oshea","Parsa","Pascal","Pryce","Quade","Quamir","Quavon","Raistlin","Rance","Remi","Renard","Rushil","Saquan","Shayden","Shedrick","Shulem","Soham","Tafari","Takota","Tayon","Terrick","Thanh","Tracey","Yanni","Yoseph","Zachry","Zakariya","Zavien","Zebadiah","Aleck","Alias","Alistair","Amadeus","Amiri","An","Aristeo","Ash","Asim","Bailee","Bashar","Cainan","Calin","Camdyn","Camerin","Cipriano","Coltan","Coltyn","Cordel","Corry","Cris","Dallan","Darnel","Denzell","Diallo","Diandre","Dillian","Eamonn","Eduard","Enmanuel","Erion","Esgar","Fabricio","Faizan","Farris","Georgios","Giacomo","Hagan","Ikaika","Ilya","Izik","Jaccob","Jael","Jakai","Jamaree","Jamier","Jasmine","Jayvion","Jenson","Jeremi","Johannes","Jorje","Joziah","Kaan","Kaito","Kendel","Keneth","Kerwin","Khang","Kori","Lamarr","Lashaun","Leeroy","Lorenz","Lovell","Macklin","Maksim","Marquice","Martinez","Mckade","Merritt","Michelle","Moishe","Muhamed","Nam","Nicco","Ori","Pacen","Parish","Paulino","Payden","Peterson","Phil","Pietro","Ramel","Rivaldo","Ruslan","Sarkis","Shahid","Shomari","Silverio","Sixto","Stefen","Taten","Tavarus","Tayveon","Teegan","Telly","Thatcher","Thurman","Tiler","Tomer","Tou","Trevonte","Trinton","Tyrick","Vasilios","Yannick","Zacarias","Zaccary","Aaren","Aarron","Aaryn","Adem","Alexys","Amaury","Aneesh","Antwaun","Antwuan","Arlen","Avant","Avry","Bashir","Benjiman","Bergen","Blue","Bradey","Cadin","Cardell","Carver","Cord","Cori","Cullin","Dalon","Darshan","Dasan","Dayron","Deaunte","Derwin","Dolan","Dravin","Elgin","Eliah","Etienne","Faizon","Hal","Hisham","Jacquan","Jahi","Jahir","Janson","Jarquez","Jarrad","Jaskaran","Jaylynn","Jaziah","Jerrold","Jossue","Kagen","Kaiser","Kaleel","Kalel","Kavion","Kedric"];


const allowAnyOrigin = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
};

// used for debugging/dev, not prod
const logRequest = function(req, res, next) {
    console.log('request ', req);
    next();
}

const handleError = (message, err, res) => {
    console.log(message, err)
    res.status(500).send({ error: message });
}

const getDb = function(res, onConnect) {
    try {
        if (cachedDb) {
            onConnect(cachedDb);
        }
        else {
            MongoClient.connect(pokerGiverDbUrl, {useNewUrlParser: true}, (err, client) => {
                if (err) {
                    handleError('Error connecting to database.', err, res);
                }
                else {
                    cachedDb = client.db(pokerGiverDbName);
                    cachedDb.collection('tables').createIndex({ name: 'text' });
                    cachedDb.collection('players').createIndex({ netChipsThisMonth: 1 });
                    cachedDb.collection('players').createIndex({ netChipsThisWeek: 1 });
                    onConnect(cachedDb);
                }
            });
        }
    }
    catch (error) {
        console.log('ERROR connecting to Mongo ', error.name, error.message, error.stack);
        res.status(500).send('Error connecting to database.');
    }
}

const getNewGame = (numberOfPlayers, numberOfAiPlayers) => {
    const game = {
        id: uuid(),
        isStarted: false,
        currentTurnIndex: 0,
        littleBlindAmount: 5,
        bigBlindAmount: 10,
        bigBlindIndex: 0,
        littleBlindIndex: 0,
        currentBet: 0,
        currentPotAmount: 0,
        cardsOnTable: [],
        currentDeck: [],
        currentCardIndex: 0,
        roundNumber: 1,
        numberOfPlayers: numberOfPlayers,
        players: []
    };
    let numberOfAiPlayersNeeded = numberOfAiPlayers;
    while (numberOfAiPlayersNeeded > 0) {
        const randomNameIndex = Math.floor(Math.random() * names.length);
        game.players.push({
            name: "BOT-" + names[randomNameIndex],
            isHuman: false,
            numberOfChips: 2000 + Math.floor(Math.random() * 1000),
            isPlayed: false,
            isOut: false
        });

        numberOfAiPlayersNeeded--;
    }

    return game;
}

var app = express();
app.use(bodyParser.json());
app.use(allowAnyOrigin);

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log("INFO: app started on port " + port);
});

const generateHash = (plainTextPassword, salt) => {
    return crypto.pbkdf2Sync(plainTextPassword, salt, 10000, 512, 'sha512').toString('hex');
}

// return { salt, hash }
const generateSecurePassword = (plainTextPassword) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = generateHash(plainTextPassword, salt);
    return { salt, hash };
}

const isPasswordValid = (plainTextPassword, userSalt, userHash) => {
    const hash = generateHash(plainTextPassword, userSalt);
    return hash === userHash;
}

const generateJwt = (playerName) => {
    const expirationDate = new Date();
    expirationDate.addHours(1);

    return jwt.sign({
        playerName,
        exp: expirationDate.getTime()
    }, JWT_SECRET);
}

app.post("/create-user", (req, res, next) => {
    getDb(res, (db) => {
        const playerName = req.body.username;
        const password = req.body.password;
        db.collection('players').findOne({ name: { $eq: playerName } }, (err, existingPlayer) => {
            if (err) {
                handleError('Error checking if player name ' + playerName + ' exists.', err, res);
            }
            else if (existingPlayer) {
                res.status(400).send({ playerAlreadyExists: true });
            }
            else {
                db.collection('players').findOne({ email: { $eq: req.body.email } }, (err, existingPlayer) => {
                    if (err) {
                        handleError('Error checking if player name ' + playerName + ' exists.', err, res);
                    }
                    else if (existingPlayer) {
                        res.status(400).send({ isEmailTaken: true });
                    }
                    else {
                        const securePassword = generateSecurePassword(password);
                        const player = {
                            name: playerName,
                            email: req.body.email,
                            hash: securePassword.hash,
                            salt: securePassword.salt,
                            numberOfChips: STARTING_CHIPS_QTY,
                            netChipsThisMonth: 0,
                            netChipsThisWeek: 0,
                            winningNetChipsLastMonth: 0,
                            winningNetChipsLastWeek: 0
                        };
                        db.collection('players').insertOne(player, (err) => {
                            if (err) {
                                handleError('Error creating new player.', err, res);
                            }
                            else {
                                const token = generateJwt(playerName);
                                const responseBody = {
                                    token,
                                    numberOfChips: player.numberOfChips
                                };
                                res.status(200).send(responseBody);
                            }
                        });
                    }
                });
            }
        });
    });
});

const isAuthorizedToStartGame = (req, res, onSuccess) => {
    verifyToken(req.body.token, res, playerName => {
        getDb(res, db => {
            db.collection('games').findOne({ id: { $eq: req.params.gameId } }, (err, game) => {
                if (err) {
                    handleError('Error finding game with id ' + req.params.gameId, err, res);
                }
                else if (game) {
                    const isAuthorized = !game.isStarted && playerName === game.createdBy;
                    onSuccess(isAuthorized, game.isStarted);
                }
                else {
                    res.status(404).send({ error: 'Could not find game with that ID.' });
                }
            })
        })
    })
}

// maybe use auth lambda gateway or something in future
app.post("/authenticate", (req, res, next) => {
    // use in socket when joining games
    // todo: pass from both app and ws server to refresh exp of token (keep user logged in)
    verifyToken(req.body.token, res, (playerName) => {
        const refreshedToken = generateJwt(playerName);
        res.status(200).send({ isAuthenticated: true, refreshedToken });
    });
});
app.post("/player/start-game/:gameId/is-authorized", (req, res, next) => {
    isAuthorizedToStartGame(req, res, isAuthorized => {
        res.status(200).send({ isAuthorized });
    });
})

app.post("/log-in", (req, res, next) => {
    const playerName = req.body.username;
    const password = req.body.password;

    getDb(res, (db) => {
        db.collection('players').findOne({ name: { $eq: playerName } }, (err, existingPlayer) => {
            if (err) {
                handleError('Error occurred while logging in.', err, res);
            }
            else if (!existingPlayer) {
                res.status(400).send({ playerExists: false, error: 'Could not find player with that username.' });
            }
            else if (!isPasswordValid(password, existingPlayer.salt, existingPlayer.hash)) {
                res.status(400).send({ playerExists: true, error: 'Password is invalid.' });
            }
            else {
                const token = generateJwt(existingPlayer.name);
                const numberOfChips = existingPlayer.numberOfChips || 0;
                res.status(200).send({ token, numberOfChips });
            }
        });
    });
});

// todo: query games to join by name (partial match, toLower)
// todo: use pagination, or at least ensure no duplicate games ($sample doesnt ensure this)
app.post("/tables", (req, res, next) => {
    verifyToken(req.body.token, res, () => {
        getDb(res, (db) => {
            const aggregationSteps = [
                { $sample: { size: 10 } },
                { $match: { 
                    isFull: { $ne: true }, 
                    isOver: { $ne: true } 
                } }
            ];
            if (req.body.query) {
                const queryStep = { $match: { $text: { $search: req.body.query } } };
                aggregationSteps.splice(0, 0, queryStep);
            }

            var tablesCursor = db.collection('tables').aggregate(aggregationSteps);
            tablesCursor.get((err, tables) => {
                if (err) {
                    handleError('Error getting random list of tables.', err, res);
                }
                else {
                    res.status(200).send(tables);
                }
            });
        });
    })
});


app.post("/table", (req, res, next) => {
    verifyToken(req.body.token, res, playerName => {
        const table = req.body.table;
        table.name = table.name ? table.name.toLowerCase().trim() : null;

        if (table.name) {
            getDb(res, (db) => {
                db.collection('tables').findOne({ name: { $eq: table.name } }, (err, existingTable) => {
                    if (err) {
                        handleError('Error querying tables to verify name uniqueness.', err, res);
                    }
                    else if (existingTable) {
                        const errorMessage = 'Table with name ' + table.name + ' is already taken.';
                        res.status(400).send({ isNameTaken: true, error: errorMessage });
                    }
                    else {
                        const game = getNewGame(table.numberOfPlayers, table.numberOfAiPlayers);
                        game.createdBy = playerName;

                        db.collection('games').insertOne(game, (err) => {
                            if (err) {
                                handleError('Error saving new game.', err, res);
                            }
                            else {
                                table.gameId = game.id;
                                table.numberOfHumanPlayers = 0;
                                table.isFull = table.numberOfAiPlayers >= table.numberOfPlayers - 1;
                                db.collection('tables').insertOne(table, (err) => {
                                    if (err) {
                                        handleError('Error saving new table.', err, res);
                                    }
                                    else {
                                        res.status(200).send({ gameId: game.id });
                                    }
                                });
                            }
                        });
                    }
                });
            });
        }
        else {
            res.status(400).send({ error: 'Table name is required.' });
        }
    })
});

const setIsTableFull = (gameId, res, isAdding) => {
    getDb(res, (db) => {
        db.collection('tables').findOne({ gameId: { $eq: gameId } }, (err, table) => {
            if (err) {
                handleError('Error getting table by game ID ' + gameId, err, res);
            }
            else if (table) {
                table.numberOfHumanPlayers += isAdding ? 1 : -1;
                const isFull = table.numberOfHumanPlayers + table.numberOfAiPlayers >= table.numberOfPlayers;
                const isOver = !isFull && table.numberOfHumanPlayers + table.numberOfAiPlayers <= 1;
                db.collection('tables').updateOne(
                    { gameId: gameId },
                    { $set: { isFull: isFull, isOver: isOver, numberOfHumanPlayers: table.numberOfHumanPlayers } },
                    (err, result) => {
                        if (err) {
                            handleError('Error updating table ' + table.name + ' to full/not-full');
                        }
                        else {
                            res.status(200).send();
                        }
                    }
                )
            }
            else {
                res.status(404).send();
            }
        })
    });
}

// todo: lock this down, perhaps by IP whitelist, so only WS server can add/remove or other admin functions
// todo: verify isFull and isOver actually work, i.e. those tables are no longer returned
app.put("/game/:id/addPlayer", (req, res, next) => {
    const gameId = req.params.id;
    setIsTableFull(gameId, res, true);
});
app.put("/game/:id/removePlayer", (req, res, next) => {
    const gameId = req.params.id;
    setIsTableFull(gameId, res, false);
});

// todo: evaluate if I need this endpoint; don't want to save game constantly, no need
// app.put("/game/:id", (req, res, next) => {
//     getDb(res, (db) => {
//         delete req.body._id;
//         const isFull = game.players.length >= game.numberOfPlayers;
//         db.collection('games').replaceOne({ id: { $eq: req.params.id} }, req.body, (err) => {
//             if (err) {
//                 handleError('Error updating game with ID ' + req.params.id, err, res);
//             }   
//             else {
//                 res.status(200).send();
//             }
//         });
//     });
// });

// todo: lock this down (see above 'lock this down')
app.get("/game/:id", (req, res, next) => {
    getDb(res, (db) => {
        db.collection('games').findOne({ id: { $eq: req.params.id } }, (err, game) => {
            if (err) {
                handleError('Error getting game by ID ' + req.params.id, err, res);
            }
            else if (game) {
                res.status(200).send(game);
            }
            else {
                res.status(404).send({ error: 'No game could be found with id ' + req.params.id });
            }
        })
    });
});

app.put("/game/:gameId/start", (req, res, next) => {
    isAuthorizedToStartGame(req, res, (isAuthorized, isGameStarted) => {
        if (isAuthorized) {
            getDb(res, db => {
                db.collection('games').updateOne(
                    { id: req.params.gameId }, 
                    { $set: { isStarted: true } },
                    (err, result) => {
                        if (err) {
                            handleError('Error starting game w/ id ' + req.params.gameId, err, res);
                        }
                        else {
                            res.status(200).send();
                        }
                    }
                )
            })
        }  
        else if (!isGameStarted) {
            res.status(401).send({ error: 'User is not authorized to start this game.' });
        }
        else {
            res.status(200).send();
        }
    })
});

// todo: lock this down (see above 'lock this down')
app.delete("/game/:id", (req, res, next) => {
    // todo: delete game and associated table
    getDb(res, (db) => {
        db.collection('games').deleteOne({ id: { $eq: req.params.id } }, (err) => {
            if (err) {
                handleError('Error deleting game with id ' + req.params.id, err, res);
            }
            else {
                db.collection('tables').deleteOne(
                    { gameId: { $eq: req.params.id } },
                    (err) => {
                        if (err) {
                            handleError('Error deleting table with gameId ' + req.params.id, err, res);
                        }
                        else {
                            res.status(200).send();
                        }
                    }  
                );
            }
        });
    });
});

const isTokenExpired = (expiry) => {
    const currentTime = new Date().getTime();
    return expiry <= currentTime;
}

// return playerName if successful
const verifyToken = (token, res, onSuccess) => {
    jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
        if (err || !decodedToken || !decodedToken.playerName) {
            res.status(401).send({ error: 'User token is invalid!' });
        }
        else if (isTokenExpired(decodedToken.exp)) {
            res.status(401).send({ isTokenExpired: true, error: 'User token has expired!' });
        }
        else {
            onSuccess(decodedToken.playerName);
        }
    });
}

const updatePlayerChipsCount = (req, res, isAdding) => {
    verifyToken(req.body.token, res, (playerName) => {
        getDb(res, (db) => {
            const factor = isAdding ? 1 : -1;
            const changeAmount = factor * req.body.numberOfChips;
            db.collection('players').updateOne(
                { name: playerName },
                { $inc: { numberOfChips: changeAmount } },
                (err, result) => {
                    if (err) {
                        handleError('ERROR updating player ' + playerName + ' chips', err, res);
                    }
                    else {
                        res.status(200).send();
                    }
                }    
            )
        });
    });
}

app.put("/player/addChips", (req, res, next) => {
    updatePlayerChipsCount(req, res, true);
});

app.put("/player/removeChips", (req, res, next) => {
    updatePlayerChipsCount(req, res, false);
});

app.post("/chips-count", (req, res, next) => {
    verifyToken(req.body.token, res, (playerName) => {
        getDb(res, (db) => {
            db.collection('players').findOne({ name: { $eq: playerName } }, (err, player) => {
                if (err) {
                    handleError('ERROR finding player with name ' + playerName, err, res);
                }
                else {
                    res.status(200).send({ numberOfChips: player.numberOfChips })
                }
            })
        });
    });
})

app.put("/player/net-chips-change", (req, res, next) => {
    verifyToken(req.body.token, res, playerName => {
        getDb(res, db => {
            const changeAmount = req.body.netChipsChange;
            db.collection('players').updateOne(
                { name: playerName },
                { $inc: { netChipsThisMonth: changeAmount, netChipsThisWeek: changeAmount } },
                (err, result) => {
                    if (err) {
                        handleError('ERROR updating net chips for player ' + playerName, err, res);
                    }
                    else {
                        res.status(200).send();
                    }
                }
            )
        });
    })
})

getNetScore = (player, rankingType, timeType) => {
    let netScore = 0;

    if (rankingType === 'month') {
        if (timeType === 'current') {
            netScore = player.netChipsThisMonth;
        }
        else { // last
            netScore = player.winningNetChipsLastMonth;
        }
    }
    else { // week 
        if (timeType === 'current') {
            netScore = player.netChipsThisWeek;
        }
        else { // last
            netScore = player.winningNetChipsLastWeek;
        }
    }

    return netScore;
}

app.post("/rankings/:rankingType/:timeType", (req, res, next) => {
    // todo: be able to pass limit? or read from db the winnings?
    verifyToken(req.body.token, res, playerName => {
        getDb(res, db => {
            const sortAction = {};

            if (req.params.rankingType === 'month') {
                if (req.params.timeType === 'current') {
                    sortAction.netChipsThisMonth = -1;
                }
                else { // last
                    sortAction.winningNetChipsLastMonth = -1;
                }
            }
            else { // week 
                if (req.params.timeType === 'current') {
                    sortAction.netChipsThisWeek = -1;
                }
                else { // last
                    sortAction.winningNetChipsLastWeek = -1;
                }
            }

            // todo: handle ties
            const rankingsCursor = db.collection('players').find().sort(sortAction).limit(10).toArray();
            rankingsCursor.then(rankedPlayers => {
                // todo: error handling?
                const rankings = rankedPlayers.map(player => {
                    return { 
                        playerName: player.name, 
                        netScore: getNetScore(player, req.params.rankingType, req.params.timeType) 
                    };
                })

                if (req.params.timeType === 'current') {
                    db.collection('winnings').find({ type: { $eq: req.params.rankingType } }, (err, winningsCursor) => {
                        winningsCursor.toArray().then(winnings => {
                            for (var i = 0; i < winnings.length; i++) {
                                const winning = winnings[i];
                                const winningIndex = winning.place - 1;
                                rankings[winningIndex].winningAmount = winning.amount;
                            }
                            res.status(200).send(rankings);
                        })
                    })
                }
                else {
                    res.status(200).send(rankings);
                }
            })
        })
    })
})

app.post("/charities/search", (req, res, next) => {
    verifyToken(req.body.token, res, () => {
        if (CHARITY_NAVIGATOR_APP_ID && CHARITY_NAVIGATOR_API_KEY) {
            fetch("https://api.data.charitynavigator.org/v2/Organizations?" + 
                "app_id=" + CHARITY_NAVIGATOR_APP_ID + 
                "&app_key=" + CHARITY_NAVIGATOR_API_KEY + 
                "&pageSize=25&" + 
                "search=" + req.body.query + 
                "&minRating=3")
            .then(
                queryResponse => {
                    res.status(200).send(queryResponse);
                },
                err => {
                    res.status(500).send({ error: 'There was a problem searching charities.' });
                }
            )
        }
        else {
            //#region Test Result

            const testResult = [
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=15556&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "Founded in 1944, The Jewish Community Relations Council (JCRC) works to define and advance the values, interests and priorities of the organized Jewish community of Greater Boston in the public square. To achieve our shared values effectively, JCRC and the Greater Boston Jewish community work toward a strong infrastructure of community relations, articulated through building our community's connection and commitment to civil society, developing the next generation of Jewish leaders, weaving a strong network of Jewish organizations, and investing in deep ties with actors in the public square.",
                  "websiteURL": "http://www.jcrcboston.org/",
                  "tagLine": "Defining and advancing the values, interests and priorities of the organized Jewish community of Greater Boston in the public square.",
                  "charityName": "Jewish Community Relations Council",
                  "ein": "042104347",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Religion",
                    "categoryID": 9,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=9&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/public.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 26,
                    "causeName": "Religious Activities",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=9&cuid=26&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/religious_activities.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 1132459,
                    "nteeType": "International, Foreign Affairs and National Security",
                    "nteeSuffix": "Z",
                    "incomeAmount": 2541781,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "September, 2017",
                    "rulingDate": "June, 1951",
                    "nteeCode": "Q70",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "International Human Rights",
                    "accountingPeriod": "September",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "Q"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "MA",
                    "city": "Boston",
                    "postalCode": "02110",
                    "streetAddress1": "126 High Street",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/042104347/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Jewish Community Relations Council",
                    "ein": "042104347",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=15556&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/042104347"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=5852&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "The Santa Barbara Foundation is a community foundation established in 1928 to enrich the lives of the people of Santa Barbara County through philanthropy. The Foundation achieves this by responding to community needs well as by serving those who wish to carry out their philanthropy in Santa Barbara County and beyond. The Foundation serves as a leader, catalyst, and resource for philanthropy. We build and prudently manage a growing endowment for the community's present and future needs. We provide secure, flexible and effective opportunities for donors to improve their community. We strive for measurable community improvement through strategic funding in such fields as education, personal development, health, human services, culture, recreation, community enhancement, and the environment.",
                  "websiteURL": "http://www.sbfoundation.org/",
                  "tagLine": "For good. For ever.",
                  "charityName": "Santa Barbara Foundation",
                  "ein": "951866094",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 22,
                    "causeName": "Community Foundations",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=22&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/community_foundations.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 259089047,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": null,
                    "incomeAmount": 115054645,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "December, 2016",
                    "rulingDate": "May, 1938",
                    "nteeCode": "T31",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Community Foundations",
                    "accountingPeriod": "December",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "CA",
                    "city": "Santa Barbara",
                    "postalCode": "93101",
                    "streetAddress1": "1111 Chapala Street",
                    "streetAddress2": "Suite 200"
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/951866094/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Santa Barbara Foundation",
                    "ein": "951866094",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=5852&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/951866094"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=4535&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "Since 1951 The Community Foundation for Greater Atlanta has been connecting community members, nonprofits and other partners to strengthen the Atlanta region through philanthropy. There are more than 700 community foundations across the country each with one goal - to create a vital, philanthropic community within their geographic area. The Community Foundation for Greater Atlanta does that right here in Atlanta within our 23-county region. As a community foundation, we focus on four key goals: engaging our community; strengthening our region's non-profits; advancing public will; and practicing organizational excellence.",
                  "websiteURL": "http://www.cfgreateratlanta.org",
                  "tagLine": "Connecting passion with purpose",
                  "charityName": "The Community Foundation for Greater Atlanta",
                  "ein": "581344646",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 22,
                    "causeName": "Community Foundations",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=22&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/community_foundations.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 748589938,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": "0",
                    "incomeAmount": 302002015,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "December, 2016",
                    "rulingDate": "October, 1977",
                    "nteeCode": "T31",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Community Foundations",
                    "accountingPeriod": "December",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "GA",
                    "city": "Atlanta",
                    "postalCode": "30303    ",
                    "streetAddress1": "191 Peachtree Street, NE",
                    "streetAddress2": "Suite 1000, Tenth Floor"
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/581344646/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "The Community Foundation for Greater Atlanta",
                    "ein": "581344646",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=4535&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/581344646"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=15595&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "CISA (Community Involved in Sustaining Agriculture) strengthens farms and engages the community to build the local food economy. ",
                  "websiteURL": "http://www.buylocalfood.org/",
                  "tagLine": "Connecting farmers and the community",
                  "charityName": "Community Involved in Sustaining Agriculture",
                  "ein": "043416862",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 27,
                    "causeName": "Housing and Neighborhood Development",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=27&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/housing.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 1734559,
                    "nteeType": "Food, Agriculture and Nutrition",
                    "nteeSuffix": null,
                    "incomeAmount": 1506820,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "December, 2017",
                    "rulingDate": "March, 2000",
                    "nteeCode": "K25",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Farmland Preservation",
                    "accountingPeriod": "December",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "K"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "MA",
                    "city": "South Deerfield",
                    "postalCode": "01373",
                    "streetAddress1": "One Sugarloaf Street",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/043416862/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Community Involved in Sustaining Agriculture",
                    "ein": "043416862",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=15595&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/043416862"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=11599&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "At Greater Ottawa County United Way, our mission is to improve the quality of life for all Ottawa County residents by identifying pressing community challenges and focusing the community's collective power and resources to address those needs. Our vision is to create lasting change in the health & human services realm through the LIVE UNITED and \"Community Impact\" models. United Way has been making a difference in Ottawa County for nearly a century. Known in the 1920s as United Fund or Community Chest, annual fund drives to address community needs were a fixture of life in many communities in Ottawa County.",
                  "websiteURL": "http://www.ottawaunitedway.org",
                  "tagLine": "Live united",
                  "charityName": "Greater Ottawa County United Way",
                  "ein": "383522782",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 42,
                    "causeName": "United Ways",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=42&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/United_Way.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 3407731,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": null,
                    "incomeAmount": 3378427,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "March, 2018",
                    "rulingDate": "July, 2000",
                    "nteeCode": "T31",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Community Foundations",
                    "accountingPeriod": "March",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "MI",
                    "city": "Holland",
                    "postalCode": "49423",
                    "streetAddress1": "115 Clover Street",
                    "streetAddress2": "Suite 300"
                  },
                  "donationAddress": {
                    "country": null,
                    "stateOrProvince": "MI",
                    "city": "Holland",
                    "postalCode": "49422",
                    "streetAddress1": "PO Box 1349",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/383522782/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Greater Ottawa County United Way",
                    "ein": "383522782",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=11599&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/383522782"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=5104&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "In 1968, community leaders formed The Community Foundation Serving Richmond and Central Virginia to provide stewardship for permanent endowments that enhance the lives of area citizens. The Community Foundation enhances the quality of life in Richmond and Central Virginia by inspiring philanthropy and civic engagement, empowering donors and community partners and providing stewardship of community resources. With combined assets of $667 million, The Community Foundation is one of the largest grantmakers in Virginia.",
                  "websiteURL": "http://www.tcfrichmond.org",
                  "tagLine": "You make the difference. We make it possible.",
                  "charityName": "The Community Foundation Serving Richmond and Central Virginia",
                  "ein": "237009135",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 22,
                    "causeName": "Community Foundations",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=22&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/community_foundations.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 492092439,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": "0",
                    "incomeAmount": 60315332,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "December, 2016",
                    "rulingDate": "March, 1970",
                    "nteeCode": "T31",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Community Foundations",
                    "accountingPeriod": "December",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "VA",
                    "city": "Richmond",
                    "postalCode": "23225",
                    "streetAddress1": "7501 Boulders View Drive",
                    "streetAddress2": "Suite 110"
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/237009135/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "The Community Foundation Serving Richmond and Central Virginia",
                    "ein": "237009135",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=5104&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/237009135"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=8230&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "The United Way of Lake & Sumter Counties helps solve specific community issues that impact local families, seniors, children, and the disabled. Each community is different, therefore each community's issues are different. It is important to support your community where you live because it benefits those in need, your community as a whole, the local economy and you and your family as well. We raise money for various agencies within Lake and Sumter Counties.",
                  "websiteURL": "http://www.uwls.org",
                  "tagLine": "Live united",
                  "charityName": "United Way of Lake & Sumter Counties",
                  "ein": "591143758",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 42,
                    "causeName": "United Ways",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=42&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/United_Way.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 2766995,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": null,
                    "incomeAmount": 1896453,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "June, 2017",
                    "rulingDate": "September, 1967",
                    "nteeCode": "T70",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Fund Raising Organizations That Cross Categories",
                    "accountingPeriod": "June",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "FL",
                    "city": "Leesburg",
                    "postalCode": "34788",
                    "streetAddress1": "32644 Blossom Lane",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/591143758/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "United Way of Lake & Sumter Counties",
                    "ein": "591143758",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=8230&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/591143758"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=3547&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "The mission of the Community Foundation of Greater Memphis is to strengthen our community through philanthropy. To accomplish this mission, we: (1) develop and effectively manage charitable funds and endowments, offering the highest levels of service and expertise to individuals, families, and institutional donors and their successors; (2) actively address the needs of the community by examining community issues, securing and distributing resources, advocating when appropriate, and convening meetings and conversations which encourage people to respond; and (3) encourage philanthropy and the growth of charitable resources among individuals, families, businesses, and community institutions. ",
                  "websiteURL": "http://www.cfgm.org",
                  "tagLine": "Strengthening our community through philanthropy",
                  "charityName": "Community Foundation of Greater Memphis",
                  "ein": "581723645",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 22,
                    "causeName": "Community Foundations",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=22&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/community_foundations.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 356966108,
                    "nteeType": "Philanthropy, Voluntarism and Grantmaking Foundations",
                    "nteeSuffix": "0",
                    "incomeAmount": 121353702,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "April, 2017",
                    "rulingDate": "August, 1990",
                    "nteeCode": "T31",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Community Foundations",
                    "accountingPeriod": "April",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "T"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "TN",
                    "city": "Memphis",
                    "postalCode": "38104",
                    "streetAddress1": "1900 Union Avenue",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/581723645/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Community Foundation of Greater Memphis",
                    "ein": "581723645",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=3547&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/581723645"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=17147&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "Loaves & Fishes Community Services has served our community since 1984. Our vision is to end hunger in our community. Our mission is to provide food and leadership in the community by uniting and mobilizing resources to empower people to be self-sufficient.",
                  "websiteURL": "http://www.loaves-fishes.org/",
                  "tagLine": "Ending hunger, transforming lives",
                  "charityName": "Loaves & Fishes Community Services",
                  "ein": "363786777",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Human Services",
                    "categoryID": 6,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=6&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/health.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 18,
                    "causeName": "Food Banks, Food Pantries, and Food Distribution",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=6&cuid=18&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/food_banks.gif?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 3976235,
                    "nteeType": "Human Services - Multipurpose and Other",
                    "nteeSuffix": "Z",
                    "incomeAmount": 12850541,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "June, 2017",
                    "rulingDate": "March, 1992",
                    "nteeCode": "P20",
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization which receives a substantial part of its support from a governmental unit or the general public   170(b)(1)(A)(vi)",
                    "nteeClassification": "Human Service Organizations - Multipurpose",
                    "accountingPeriod": "June",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": "P"
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "IL",
                    "city": "Naperville",
                    "postalCode": "60540",
                    "streetAddress1": "1871 High Grove Lane",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/363786777/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Loaves & Fishes Community Services",
                    "ein": "363786777",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=17147&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/363786777"
                      }
                    }
                  }
                },
                {
                  "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=12806&utm_source=DataAPI&utm_content=9af5afa3",
                  "mission": "The Jewish Federation of Delaware works to mobilize the Jewish community to address issues, meet needs and build an agenda for the future. Our vision is to bring Jewish people together into a community coalition, grounded in Jewish teaching and heritage, to strengthen the State of Israel, the global Jewish family and local organizations in order to further the survival of the Jewish people. Our goals are to foster identification with our Jewish teaching and heritage to inspire an informed and involved community; build an agenda for the future with clearly defined priorities; take responsibility for raising funds which meet mutually agreed upon goals; allocate and manage the community's resources based upon the community agenda; provide a structure for the Jewish community to interact with the non-Jewish community; and develop Jewish leadership.",
                  "websiteURL": "http://www.shalomdelaware.org",
                  "tagLine": "We Grow Stronger TOGETHER",
                  "charityName": "Jewish Federation of Delaware",
                  "ein": "510064315",
                  "currentRating": {
                    "ratingImage": {
                      "small": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4starsb.png",
                      "large": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/stars/4stars.png"
                    },
                    "rating": 4
                  },
                  "category": {
                    "categoryName": "Community Development",
                    "categoryID": 10,
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.categories&categoryid=10&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/icons/categories/religion.png?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "cause": {
                    "causeID": 43,
                    "causeName": "Jewish Federations",
                    "charityNavigatorURL": "https://www.charitynavigator.org/index.cfm?bay=search.results&cgid=10&cuid=43&utm_source=DataAPI&utm_content=9af5afa3",
                    "image": "https://d20umu42aunjpx.cloudfront.net/_gfx_/causes/small/Jewish_Federation.jpg?utm_source=DataAPI&utm_content=9af5afa3"
                  },
                  "irsClassification": {
                    "deductibility": "Contributions are deductible",
                    "subsection": "501(c)(3)",
                    "assetAmount": 38952702,
                    "nteeType": null,
                    "nteeSuffix": null,
                    "incomeAmount": 8793138,
                    "filingRequirement": "990 (all other) or 990EZ return",
                    "classification": "Charitable Organization",
                    "latest990": "June, 2017",
                    "rulingDate": "May, 1945",
                    "nteeCode": null,
                    "groupName": null,
                    "deductibilityCode": "1",
                    "affiliation": "Independent - the organization is an independent organization or an independent auxiliary (i.e., not affiliated with a National, Regional, or Geographic grouping of organizations).",
                    "foundationStatus": "Organization that normally receives no more than one-third of its support from gross investment income and unrelated business income and at the same time more than one-third of its support from contributions, fees, and gross receipts related to exempt purposes.  509(a)(2)",
                    "nteeClassification": null,
                    "accountingPeriod": "June",
                    "deductibilityDetail": null,
                    "exemptOrgStatus": "Unconditional Exemption",
                    "exemptOrgStatusCode": "01",
                    "nteeLetter": null
                  },
                  "mailingAddress": {
                    "country": null,
                    "stateOrProvince": "DE",
                    "city": "Wilmington",
                    "postalCode": "19803",
                    "streetAddress1": "101 Garden of Eden Road",
                    "streetAddress2": null
                  },
                  "advisories": {
                    "severity": null,
                    "active": {
                      "_rapid_links": {
                        "related": {
                          "href": "https://api.data.charitynavigator.org/v2/Organizations/510064315/Advisories?status=ACTIVE"
                        }
                      }
                    }
                  },
                  "organization": {
                    "charityName": "Jewish Federation of Delaware",
                    "ein": "510064315",
                    "charityNavigatorURL": "https://www.charitynavigator.org/?bay=search.summary&orgid=12806&utm_source=DataAPI&utm_content=9af5afa3",
                    "_rapid_links": {
                      "related": {
                        "href": "https://api.data.charitynavigator.org/v2/Organizations/510064315"
                      }
                    }
                  }
                }
              ];

            //#endregion

            
            res.status(200).send(testResult);
            // data returned (relevant)
            /**
             * {
             *      "charityNavigatorURL",
             *      "mission",
             *      "websiteURL",
             *      "charityName"
             *      "currentRating": {
             *          "ratingImage"."large",
             *          "rating" (number)
             *      },
             *      "category"."categoryName"
             * }
             */
        }
    });
})