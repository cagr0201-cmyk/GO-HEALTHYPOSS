const MENU_CATEGORIES = [
  {
    "id": "G7Dybmqujf1ahEEDJask",
    "name": "KAHVALTILAR",
    "icon": "🍳"
  },
  {
    "id": "IDG2uULBtLhcIicltKSI",
    "name": "HEALTHY BRUSCHETTA",
    "icon": "🍞"
  },
  {
    "id": "HzfdmS0BdMoEGtRX6IDg",
    "name": "SALATALAR",
    "icon": "🥗"
  },
  {
    "id": "L3SlF5TXqvlpC0tD2oVI",
    "name": "MAKARNALAR",
    "icon": "🍝"
  },
  {
    "id": "J9V643KQdRIYsJiOHmLX",
    "name": "KASELER",
    "icon": "🥣"
  },
  {
    "id": "kDkKyJRAjMcPSr69pEDk",
    "name": "FAST&HEALTHY",
    "icon": "🍔"
  },
  {
    "id": "qKvNEcG5aQN2nx9ygarX",
    "name": "APERATİFLER",
    "icon": "🍟"
  },
  {
    "id": "yKsnp6EFSg45UWDaz9LK",
    "name": "SOFT İÇECEKLER",
    "icon": "🥤"
  },
  {
    "id": "qrQmFX0ue7YpR9206WDV",
    "name": "DETOKS&SHOTLAR",
    "icon": "🍵"
  },
  {
    "id": "tETcPjbPcvEkInJMU7yL",
    "name": "TAZE SIKIM ",
    "icon": "🍊"
  },
  {
    "id": "HKdwjIy3KG9sKvHfLmzL",
    "name": "SICAK İÇECEKLER",
    "icon": "☕"
  },
  {
    "id": "lKEsPjjMDIjucLMx3QQb",
    "name": "SOĞUK KAHVELER",
    "icon": "🧋"
  }
];

const MENU_ITEMS = [
  {
    "id": "BBNpPyjOSxXmTdjPYtSK",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Magic Omlet",
    "price": 330,
    "description": "3 yumurtalı omlet, 2 adet mini pankek, 1 adet köz biber, yarım ekşi mayalı ekmek krem peynir üzeri kızarmış çeri domates, süzme yoğurtlu granola karışımı, Zeytin, misket peynir, çilek reçeli.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916689418-magic%20omlet%20.jpeg?alt=media&token=ee599f42-be49-4be7-9a11-70cd7de702c5",
    "popular": false,
    "options": []
  },
  {
    "id": "YIKTlEYjFA69uuwkWnx3",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Avokado Ekmek",
    "price": 294,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 2 adet Yumurta, Hindi füme, Yarım Avokado, Endivyen Marul, Çeri Domates.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916746895-avakado%20ekmek%20yeni.jpg?alt=media&token=2a8a324f-d2dc-4571-a754-c4da7784e0dc",
    "popular": false,
    "options": []
  },
  {
    "id": "uZ4elHg2rCzIBIzwxlRL",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Go Healthy Kahvaltı",
    "price": 396,
    "description": "2 adet Yumurta, 2 adet Hellim Peyniri, Yarım Avokado, Frankfurter sosis, Ekşi mayalı tam buğday ekmek, Fıstık Ezmesi, Çilek Reçeli, Zeytin.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916803218-go%20healthy%20kase%20yeni.jpg?alt=media&token=2b144ed2-9b89-47b0-bebd-ed9e930462cf",
    "popular": false,
    "options": []
  },
  {
    "id": "yTrDQzr0opQtpzcNBWgq",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Yumurtalı Wrap",
    "price": 295,
    "description": "Krem Peynirli Tam Buğday Lavaş İçi 2 Adet Yumurta, Köz Kapya Biber, Endivyen Marul, Çeri Domates, yarım avakado.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916845544-yumurtal%C4%B1%20wrap%20yeni.jpeg?alt=media&token=9393e926-64c8-42ca-bded-112d6e7fef88",
    "popular": false,
    "options": []
  },
  {
    "id": "1iqk0bP2N2ofFZ4iYTJu",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Sosisli Bruschetta",
    "price": 290,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 3 adet Yumurta, Frankfurter sosis.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917027605-SOS%C4%B0SL%C4%B0%20BRUSEHATTA.jpg?alt=media&token=d8506884-db5a-460c-818e-e0a513077cc9",
    "popular": false,
    "options": []
  },
  {
    "id": "7Aew6l2gSrUv0iMPN7Wl",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Tatlı Bruschetta",
    "price": 269,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri Şekersiz Fıstık ezmesi, yaban mersini, muz .\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917367876-SWEET%20BRUSEHATTA.jpg?alt=media&token=50f9e50f-939d-422e-8c4d-7f06dc628cd5",
    "popular": false,
    "options": []
  },
  {
    "id": "CUrDkzCruQbQLpreHgcc",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Mantarlı Bruschetta",
    "price": 269,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 2 adet Yumurta, sotelenmiş mantar ve soğan, krem peynir.\n",
    "image": "https://images.unsplash.com/photo-1541532713592-79a0317b6b77?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "Oca0s07CwJRPhc6SNfpw",
    "categoryId": "HzfdmS0BdMoEGtRX6IDg",
    "name": "Tavuklu Salata",
    "price": 295,
    "description": "Tavuk Izgara ( 150 - 170 )gr, Yeşil ve Renkli Kıvırcık Marul, Salatalık, Çeri Domates, Mor Soğan, Haşlanmış Nohut.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916887700-salatayeni.jpeg?alt=media&token=fb608b0e-99a6-4ba4-8af1-f9c9c4e1cd44",
    "popular": false,
    "options": []
  },
  {
    "id": "WWynmvX9srN7d4WCrlmv",
    "categoryId": "HzfdmS0BdMoEGtRX6IDg",
    "name": "Ton balıklı Salata",
    "price": 295,
    "description": "Ton Balığı, Yeşil ve Renkli Kıvırcık Marul, Salatalık, Çeri Domates, Mor Soğan.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916918682-tuna%20salada%20.jpeg?alt=media&token=437b4f60-eaeb-4a29-95a0-7ef447fa9cae",
    "popular": false,
    "options": []
  },
  {
    "id": "73DVxWyZWnlTp3ML8kTs",
    "categoryId": "L3SlF5TXqvlpC0tD2oVI",
    "name": "Domates Soslu Makarna",
    "price": 295,
    "description": "Tavuk Izgara ( 150-170 )gr, Kepekli Tam Buğday Makarna, domates sos,çeri domates ve fesleğen.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917864194-domatesyeni.jpeg?alt=media&token=ac48946a-8502-4790-95b2-899a9bc5ff73",
    "popular": false,
    "options": []
  },
  {
    "id": "8QiO0bMpllj5IGfpVuwT",
    "categoryId": "L3SlF5TXqvlpC0tD2oVI",
    "name": "Pesto Makarna",
    "price": 295,
    "description": "Tavuk Izgara ( 150-170 )gr, Kepekli Tam Buğday Makarna, Mantar, Diyet Krema. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917916849-yeni%20makarna.png?alt=media&token=87cd7ca3-293f-4f33-b374-3d3d99d48410",
    "popular": false,
    "options": []
  },
  {
    "id": "0RseBd5vNhLSDv7vTuOI",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Tavuk Kase",
    "price": 365,
    "description": "Tavuk Izgara ( 150-170)gr, Basmati Pirinç, 1 adet havuç, sotelenmiş mantar, Mor lahana, Brokoli. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917519664-TAVUK%20KAE%20YEN%C4%B0%20.jpeg?alt=media&token=cb62b6c5-b3ba-4ee5-a01b-9fda725275a6",
    "popular": false,
    "options": []
  },
  {
    "id": "5pO3wYsLUAPOvSOfL0gy",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Köfte kase",
    "price": 465,
    "description": "4 Adet köfte ( 140-150)gr, Meksika Fasulyeli Bulgur Pilavı, Brokoli, Közlenmiş Patlıcan Salatası, Coleslaw, Mor Lahana, Humus. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917559911-k%C3%B6fte%20yendi.jpg?alt=media&token=050390fa-7ef5-4817-be16-8ef71fcb677b",
    "popular": false,
    "options": []
  },
  {
    "id": "FL0yb68vavBs8mfwXb4V",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Kinoalı Kısır Kase",
    "price": 345,
    "description": "Bulgur, Tavuk Izgara ( 150-170)gr, Kinoa, Domates, Salatalık, Kornişon, Marul.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917609912-k%C4%B1s%C4%B1r%20yeni.jpeg?alt=media&token=1f85bcc9-f310-4c37-9a56-cf1cb8695e96",
    "popular": false,
    "options": []
  },
  {
    "id": "VfIhAKQkZELrvraGlNNu",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Magic Kase",
    "price": 379,
    "description": "Nohutlu Kuş Üzümlü Basmati Pirinç, Yarım Izgara Avokado, Izgara Kabak, Edamame, Brokoli, Kırmızı Pancar, Havuç, Yeşil Elma. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917767324-MAG%C4%B0C%2C%2C.png?alt=media&token=fdcdf3cc-a248-4c24-b22a-743d809251c0",
    "popular": false,
    "options": []
  },
  {
    "id": "93qTUyQ2Z5J17k2bTvWI",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Tavuk Wrap",
    "price": 348,
    "description": "Tam Buğday Lavaş İçerisi Tavuk ( 120 - 150)gr, Turşu salatası, Iceberg, Chedar Peyniri, Patates Cips. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917961074-tavuk%20wrap%20yeni%20.jpeg?alt=media&token=afc6378a-26ad-4356-bffa-18d8b275905a",
    "popular": false,
    "options": []
  },
  {
    "id": "UWcoYF9bdAm8O8uq9hh5",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Et Burger",
    "price": 405,
    "description": "Dana Burger Köfte ( 120)gr, Özel Kepekli Tam Buğday Burger Ekmeği, Marul, Köz patlıcan sos, Cheddar Peyniri, Patates Cips, Kornişon. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917994916-burgeryeni.jpeg?alt=media&token=4eadc958-556e-4cf2-8345-03c7e30a06c4",
    "popular": false,
    "options": []
  },
  {
    "id": "llqDo1yr6wNk2tXTejXO",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Pankek",
    "price": 285,
    "description": "Pankek, Çilek, Muz, Bal, Fıstık Ezmesi. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777918030588-pankekyeni.jpeg?alt=media&token=6eb8b11d-3a1a-44ff-8dbb-35b28fb143b1",
    "popular": false,
    "options": []
  },
  {
    "id": "nZReK8PvQgzFTPKIDCCO",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Porridge",
    "price": 198,
    "description": "Yulaf Ezmesi ( 60 - 80 )gr, Süt, Muz, Çilek, Kinoa. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777918060294-porridge%20yeni%20.jpeg?alt=media&token=e1cbb4ae-9c49-488e-9a24-a3b6508f6846",
    "popular": false,
    "options": []
  },
  {
    "id": "uGb18tx00PIGkVMt6eZo",
    "categoryId": "qKvNEcG5aQN2nx9ygarX",
    "name": "Aperatif-1",
    "price": 205,
    "description": "Süzme Yoğurt, roka, semiz otu, Üstüne Sotelenmiş baharatlı nohut. \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996894541-SSSSU.png?alt=media&token=6d77b18b-624b-4ca0-bc5d-6cfd997eaa0a",
    "popular": false,
    "options": []
  },
  {
    "id": "DEIVaMUvrEAFYz5ta0El",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "COLA ZERO",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "IilLw0CZ9s7TdnHJbx1h",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "AYRAN",
    "price": 30,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "LLYYKBP5PVYAY6uYOVbk",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "SU",
    "price": 25,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "avD2rzdrtg5PzujM5hel",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "SODA",
    "price": 45,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "klLjZaoLZ5qrUtWyaLgi",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "Churchill",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "7JDC4wUgKmKZB1fSPXxT",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Kırmızı Meyve Suyu",
    "price": 160,
    "description": "Pancar, Kırmızı Elma, zencefil, Limon.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996267607-pancardetokss.jpeg?alt=media&token=b13233be-a69c-4d93-8841-baa9c566fddb",
    "popular": false,
    "options": []
  },
  {
    "id": "CoNEsnAcRQWyOnonYhrI",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Turuncu Meyve Suyu",
    "price": 160,
    "description": "portakal, limon, havuç,zencefil,zerdaçal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996295519-turuncudetoks.jpeg?alt=media&token=b8cc2df3-20f7-40c4-bbbe-22e949db3093",
    "popular": false,
    "options": []
  },
  {
    "id": "UNzWyhfZh6f84LH6Sts4",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Yeşil Meyve Suyu",
    "price": 160,
    "description": "Yeşil elma, salatalık, roka,maydanoz, limon.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996365989-ye%C5%9Fildetokss.jpeg?alt=media&token=fdd41a8e-7b78-44ef-9b08-1942aaa74f6d",
    "popular": false,
    "options": []
  },
  {
    "id": "cjNOQtqVZhxdRBxhnAPM",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "portakal shot",
    "price": 160,
    "description": "portakal,limon,karabiber,bal,zencefil.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996399657-portaklashot.jpeg?alt=media&token=3089e4c6-ce2e-41da-a742-fc3cad20a713",
    "popular": false,
    "options": []
  },
  {
    "id": "oyyU9Gt66mlTCXJ3N1UF",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "pancar shot",
    "price": 80,
    "description": "pancar,zencefil,limon,bal,zerdeçal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996435869-shotk%C4%B1rm%C4%B1z%C4%B1.jpeg?alt=media&token=fb843cd4-3b72-41c0-8287-2956aceef6cd",
    "popular": false,
    "options": []
  },
  {
    "id": "xdkkcTfJ2zIthzsWpvR5",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "zencefil shot",
    "price": 80,
    "description": "limon,zencefil,bal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996492537-gingershot.jpeg?alt=media&token=3a4f02cd-d61f-43c1-b612-ec058451821a",
    "popular": false,
    "options": []
  },
  {
    "id": "HUB2sOB9POktBQqASRmf",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "PANCAR SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996547974-pancardetokss.jpeg?alt=media&token=774f6fe6-af4b-479e-a2f3-d20ab92d960c",
    "popular": false,
    "options": []
  },
  {
    "id": "JmvTDD6UCQ47AZM05Vfl",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "ELMA SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996557054-elma%20suyu.jpeg?alt=media&token=0fe031b4-ce5a-4ece-8f8f-d47695e0240e",
    "popular": false,
    "options": []
  },
  {
    "id": "Wypr7nZ7feW4ePn1l2MY",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "PORTAKAL SUYU",
    "price": 80,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "fOXzr4gXO93EvRysD4Jg",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "HAVUÇ SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996578190-turuncudetoks.jpeg?alt=media&token=c52b3f4d-171b-442f-9d22-03d3e819808b",
    "popular": false,
    "options": []
  },
  {
    "id": "0XeYIO66BGGDVZbzvkIu",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Espresso",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "21HBHl9GfhP6Kjkz1ENh",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Türk Kahvesi",
    "price": 70,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "LGGBaxjAErAGKiXkXu7r",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Filtre Kahve",
    "price": 70,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "Q139eNrn60rqG0zCv32R",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Cappuccino",
    "price": 110,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "SH0NASoYXLRWeXjM7gXC",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Americano",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "hfjuAGmbzthlHdpG37FJ",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Espresso Double",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "ssUvaX4u94rtFj3TYwYr",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Çay",
    "price": 20,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "wNivd9unUA81rQmKZNhT",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Cafe Latte",
    "price": 110,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "9TyvOH8vZydDrQ5TaKyi",
    "categoryId": "lKEsPjjMDIjucLMx3QQb",
    "name": "Ice Americano",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  },
  {
    "id": "Xriy9d1UrFlNXoT4QvCc",
    "categoryId": "lKEsPjjMDIjucLMx3QQb",
    "name": "Ice Latte",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": false,
    "options": []
  }
];

const TABLES = [
  { id: 'T1', name: 'Masa 1', category: 'Salon', x: 15, y: 15, shape: 'round', status: 'free' },
  { id: 'T2', name: 'Masa 2', category: 'Salon', x: 45, y: 15, shape: 'round', status: 'free' },
  { id: 'T3', name: 'Masa 3', category: 'Salon', x: 75, y: 15, shape: 'round', status: 'free' },
  { id: 'T4', name: 'Masa 4', category: 'Salon', x: 15, y: 55, shape: 'square', status: 'free' },
  { id: 'T5', name: 'Masa 5', category: 'Salon', x: 45, y: 55, shape: 'square', status: 'free' },
  { id: 'T6', name: 'Masa 6', category: 'Salon', x: 75, y: 55, shape: 'square', status: 'free' },
  { id: 'T7', name: 'Masa 7 (Teras)', category: 'Teras', x: 15, y: 15, shape: 'square', status: 'free' },
  { id: 'T8', name: 'Masa 8 (Teras)', category: 'Teras', x: 45, y: 15, shape: 'round', status: 'free' },
  { id: 'T9', name: 'Masa 9 (Teras)', category: 'Teras', x: 75, y: 15, shape: 'square', status: 'free' },
  { id: 'T10', name: 'Masa 10 (Teras)', category: 'Teras', x: 15, y: 55, shape: 'round', status: 'free' },
  { id: 'T11', name: 'Masa 11 (Teras)', category: 'Teras', x: 45, y: 55, shape: 'square', status: 'free' },
  { id: 'T12', name: 'Masa 12 (Teras)', category: 'Teras', x: 75, y: 55, shape: 'round', status: 'free' },
  { id: 'V1', name: 'VIP Oda 1', category: 'VIP', x: 20, y: 30, shape: 'large-round', status: 'free' },
  { id: 'V2', name: 'VIP Oda 2', category: 'VIP', x: 70, y: 30, shape: 'large-round', status: 'free' },
  { id: 'V3', name: 'VIP Oda 3', category: 'VIP', x: 20, y: 70, shape: 'large-round', status: 'free' },
  { id: 'V4', name: 'VIP Oda 4', category: 'VIP', x: 70, y: 70, shape: 'large-round', status: 'free' }
];

const STAFF_MEMBERS = [
  { id: 'ahmet', name: 'Ahmet Yılmaz', role: 'Şef Garson', code: '1111', status: 'out', shiftStart: null, totalSales: 0 },
  { id: 'merve', name: 'Merve Kaya', role: 'Garson', code: '2222', status: 'out', shiftStart: null, totalSales: 0 },
  { id: 'can', name: 'Can Demir', role: 'Garson', code: '3333', status: 'out', shiftStart: null, totalSales: 0 },
  { id: 'elif', name: 'Elif Şahin', role: 'Kasiyer', code: '4444', status: 'out', shiftStart: null, totalSales: 0 }
];

const INITIAL_STOCKS = [
  { id: 'porsiyon', name: 'Genel Porsiyon (Stok)', quantity: 99999, unit: 'porsiyon', minLimit: 10 }
];

const MENU_RECIPES = {};
