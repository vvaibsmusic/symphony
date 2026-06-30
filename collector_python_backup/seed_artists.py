"""Seed data: Top Indian artists (Punjabi, Hip-Hop, Indie, Haryanvi, Bhojpuri, Bengali, etc.)
   Excludes: Bollywood playback singers, Tamil, Telugu artists."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from db import init_db, get_connection, upsert_artist

ARTISTS = [
    # === Punjabi ===
    {"id": "diljit-dosanjh", "name": "Diljit Dosanjh", "youtube_channel_id": "UC0V69cU6Zqo5ILKA-vIsFmQ", "spotify_id": "2FKWNmZWDBZR4qN7sec70O", "genre": "Punjabi"},
    {"id": "ap-dhillon", "name": "AP Dhillon", "youtube_channel_id": "UCSyLjhUyyVMIPK4MZGO7oIA", "spotify_id": "5fMUXHkw8R8eOP2RNVYEZX", "genre": "Punjabi"},
    {"id": "karan-aujla", "name": "Karan Aujla", "youtube_channel_id": "UCN_FB1EAzJnYes92BOUFhhg", "spotify_id": "6DARBhWjJnXIFJXqwv0yW2", "genre": "Punjabi"},
    {"id": "sidhu-moose-wala", "name": "Sidhu Moose Wala", "youtube_channel_id": "UCByOQJjav0CUDwxCk-jVNRQ", "spotify_id": "4PULA4EFzYTrxYvOVlwpiQ", "genre": "Punjabi"},
    {"id": "guru-randhawa", "name": "Guru Randhawa", "youtube_channel_id": "UC4svjw4p4MmaSCCj7FpslKg", "spotify_id": "7qjJw7ts8h0aEhIRlJZfMj", "genre": "Punjabi"},
    {"id": "harrdy-sandhu", "name": "Harrdy Sandhu", "youtube_channel_id": "UCtgxVG4luB7of_S7S5rVEfQ", "spotify_id": "6qqNVTkY8uBg9cP3Jd7DAH", "genre": "Punjabi"},
    {"id": "jassie-gill", "name": "Jassie Gill", "youtube_channel_id": "UC-L5lEd2KIGYW9bK6bESjqw", "spotify_id": "4JtnJHGFxxrQZn7YbZN27X", "genre": "Punjabi"},
    {"id": "jasmine-sandlas", "name": "Jasmine Sandlas", "youtube_channel_id": "UC_MZXG6ePLkJLzh-RxlFojw", "spotify_id": "2Xme2bK3HgzSxQPf93fZCH", "genre": "Punjabi"},
    {"id": "ammy-virk", "name": "Ammy Virk", "youtube_channel_id": "UCqvv1N4TdIUvYfaFhJlOilQ", "spotify_id": "3Aiso4FMGU48djRgzJCUiy", "genre": "Punjabi"},
    {"id": "garry-sandhu", "name": "Garry Sandhu", "youtube_channel_id": "UCcYiNDPaUNx8sEJMJJAkFvw", "spotify_id": "7EPsAJSPQf1O4hgizLsMti", "genre": "Punjabi"},
    {"id": "shubh", "name": "Shubh", "youtube_channel_id": "UCWwPe_SnYkxnOICvcPovVyA", "spotify_id": "0Cfkvk0dOEfwdAr8EAAGME", "genre": "Punjabi"},
    {"id": "kaka", "name": "Kaka", "youtube_channel_id": "UC80zt_U-1y-b5QKx7tkWdCQ", "spotify_id": "7wMDO4EvYfq0FWpuEqprro", "genre": "Punjabi"},
    {"id": "b-praak", "name": "B Praak", "youtube_channel_id": "UCclQoF69MNfV4E0hBh6JD-Q", "spotify_id": "1wRPtKGflJrBx9BmLsSwlU", "genre": "Punjabi"},
    {"id": "riar-saab", "name": "Riar Saab", "youtube_channel_id": "UC8mcEboBhR_kU5Kkq1S4IIQ", "spotify_id": "3CLJaJWZPpgGL7CnAhMiCS", "genre": "Punjabi"},
    {"id": "mika-singh", "name": "Mika Singh", "youtube_channel_id": "UCiWKFYVMn_8cP3VIjAtIlQQ", "spotify_id": "4IJ7YGLdSRhWMVjGRFXZWM", "genre": "Punjabi"},

    # === Hip-Hop / Rap ===
    {"id": "badshah", "name": "Badshah", "youtube_channel_id": "UCz7YuS1bITe7H2Bnb5VxHfQ", "spotify_id": "0y59o4v8uw5crbN9M3JiL1", "genre": "Hip-Hop"},
    {"id": "honey-singh", "name": "Yo Yo Honey Singh", "youtube_channel_id": "UCDsElQAt_pSTVsCJIzsTJkQ", "spotify_id": "5B0XFxyUAocM9QIrVhupES", "genre": "Hip-Hop"},
    {"id": "raftaar", "name": "Raftaar", "youtube_channel_id": "UCfGseNfvkBkBjAeeQ7QK6uA", "spotify_id": "4ZY8LkWE2FaDFVTVbu0VEf", "genre": "Hip-Hop"},
    {"id": "divine", "name": "DIVINE", "youtube_channel_id": "UCZzF1lnlIlZtMCHBY8cJIAQ", "spotify_id": "5f4QpKfy7ptCHwTqspnSJR", "genre": "Hip-Hop"},
    {"id": "mc-stan", "name": "MC STΔN", "youtube_channel_id": "UC0JkdZnxVfibnxTix1JPULQ", "spotify_id": "1qFp8QxHGxs3GlGPvdkJ8o", "genre": "Hip-Hop"},
    {"id": "king", "name": "King", "youtube_channel_id": "UC-JFyL0zDFOsPMpS2dVKDIw", "spotify_id": "6l3HvQ5sa6mXTsMTB19rO5", "genre": "Hip-Hop"},
    {"id": "emiway-bantai", "name": "Emiway Bantai", "youtube_channel_id": "UCx4bFGMIBQLqTeLEsHNBbMQ", "spotify_id": "3ievSeITpO7psxFBFp6uA7", "genre": "Hip-Hop"},
    {"id": "kr$na", "name": "KRSNA", "youtube_channel_id": "UCuLhJT5cmLEIMC-Hyp_Rerg", "spotify_id": "275e2m1Ln7ND66CtLPPKSz", "genre": "Hip-Hop"},
    {"id": "ikka", "name": "Ikka", "youtube_channel_id": "UCjGpVX3KaE-SbPJqGvBiNDw", "spotify_id": "4EXe5QRonYFDyBz5RSPG7A", "genre": "Hip-Hop"},
    {"id": "seedhe-maut", "name": "Seedhe Maut", "youtube_channel_id": "UCPIFKxnlMrmqA4uDYUaIAfA", "spotify_id": "5ffNpNbnbZFe5oKZagssdU", "genre": "Hip-Hop"},
    {"id": "prabh-deep", "name": "Prabh Deep", "youtube_channel_id": "UCQ3MKSUUdCPBqHsLPd7DdBQ", "spotify_id": "7rHXbsEJoASYSs3QWudqey", "genre": "Hip-Hop"},
    {"id": "dino-james", "name": "Dino James", "youtube_channel_id": "UC1i0MmP8X01B30sa4yLDnOQ", "spotify_id": "7HiIkf5zyQWOJyhDw61b3j", "genre": "Hip-Hop"},
    {"id": "talha-anjum", "name": "Talha Anjum", "youtube_channel_id": "UCz3hCgHqc1p6qL2y3J2MvCA", "spotify_id": "1P3oAIVcCsGdGINNBb3D6Q", "genre": "Hip-Hop"},
    {"id": "mc-square", "name": "MC Square", "youtube_channel_id": "UCK-bHPOGn-lGBk9slquIsNQ", "spotify_id": "7iPDkJYZHy0KHCR4B1sJpV", "genre": "Hip-Hop"},
    {"id": "hanumankind", "name": "Hanumankind", "youtube_channel_id": "UC5G0Th3UCJL5OkxOTgZhECA", "spotify_id": "0G0j0q0q0q0q0q0q0q0q0q", "genre": "Hip-Hop"},
    {"id": "fotty-seven", "name": "Fotty Seven", "youtube_channel_id": "UCDhv8_xtNwmCrROPRNfLsbg", "spotify_id": "59R9jU69KJFfmkUYuqFUQi", "genre": "Hip-Hop"},
    {"id": "raga", "name": "Raga", "youtube_channel_id": "UCddqrmJN7eVJ30qmHU6Rntg", "spotify_id": "5FnYvRvJpe4T03cq9OVS3a", "genre": "Hip-Hop"},
    {"id": "bella", "name": "Bella", "youtube_channel_id": "UCaRQ-P-4nfLMawBhzO2vxHg", "spotify_id": "0W78w7OZ7fk3UkK3fLnVJL", "genre": "Hip-Hop"},
    {"id": "dakait", "name": "Dakait", "youtube_channel_id": "UC0zT-sXLfwE1Hfkqes7J6Dw", "spotify_id": "1qFp8QxHGxs3GlGPvdkJ8p", "genre": "Hip-Hop"},

    # === Indie / Alternative ===
    {"id": "prateek-kuhad", "name": "Prateek Kuhad", "youtube_channel_id": "UCSLFfA7UdHcMb9aaL78wc8Q", "spotify_id": "6WpVpHTf9tdi15XwjkNiSY", "genre": "Indie"},
    {"id": "anuv-jain", "name": "Anuv Jain", "youtube_channel_id": "UCmAX1TwVPMIO7ACsmF5ISSA", "spotify_id": "3tJoFztHeIJkHXMdOkbqAb", "genre": "Indie"},
    {"id": "ritviz", "name": "Ritviz", "youtube_channel_id": "UCmh2xaRVJkfXGA7e6U1mx7Q", "spotify_id": "3qnGvpP8Yth1AqSBMqON5x", "genre": "Indie/Electronic"},
    {"id": "when-chai-met-toast", "name": "When Chai Met Toast", "youtube_channel_id": "UCIeBWObZFt_Dv3ZhYjTqjhg", "spotify_id": "28kcGLwxLfzCIuK0P0SIJ0", "genre": "Indie"},
    {"id": "the-local-train", "name": "The Local Train", "youtube_channel_id": "UCb1bT0t3Mm4TDGJUXMzsoiQ", "spotify_id": "7nBXaUwuVj4V6QNPWWDqDi", "genre": "Indie Rock"},
    {"id": "nucleya", "name": "Nucleya", "youtube_channel_id": "UCQGQEQK5XEjaFI4VMHX9yg", "spotify_id": "0UMffqXaiBLGoPV0F5IIYL", "genre": "Electronic"},
    {"id": "lucky-ali", "name": "Lucky Ali", "youtube_channel_id": "UCWLHgW0nTAhq1a8UlSvLN7g", "spotify_id": "7bD54JOB3k8kI2h6FuOMPC", "genre": "Indie/Pop"},
    {"id": "taba-chake", "name": "Taba Chake", "youtube_channel_id": "UCzBhxfCkJ3IgYU17bZlX8Vg", "spotify_id": "0W78w7OZ7fk3UkK3fLnVJK", "genre": "Indie Folk"},
    {"id": "ankur-tewari", "name": "Ankur Tewari", "youtube_channel_id": "UCwh7tmv2Yv4E1XcNYaV2Yng", "spotify_id": "4nP5UA5wm0LkIFHqHO6P7a", "genre": "Indie"},
    {"id": "papon", "name": "Papon", "youtube_channel_id": "UCSzpGYxIllB4eBhYQ8WJLtA", "spotify_id": "0rqxICbgJKKdNlWP1kF2Nj", "genre": "Indie/Assamese"},
    {"id": "yashraj-mukhate", "name": "Yashraj Mukhate", "youtube_channel_id": "UCcfcOcnXMHjHKOKOJO2w08g", "spotify_id": "6lNF9u8WvnlCG9YeSHmO3R", "genre": "Viral/Pop"},

    # === Haryanvi ===
    {"id": "sapna-choudhary", "name": "Sapna Choudhary", "youtube_channel_id": "UCTr9CSCMG9SjNjJi0UhRFkw", "spotify_id": "0EFisYRi1XOefXCmfrM3UZ", "genre": "Haryanvi"},
    {"id": "renuka-panwar", "name": "Renuka Panwar", "youtube_channel_id": "UCiqkDpUR9Fb-3JUNbGPjjsA", "spotify_id": "6P3FJt0zPbuGMa2agN1Oqb", "genre": "Haryanvi"},
    {"id": "gulzaar-chhaniwala", "name": "Gulzaar Chhaniwala", "youtube_channel_id": "UCFe-EFkXIYelQcvn5M0HXAw", "spotify_id": "2SHfUeh7gw3LDgjxyT0bxV", "genre": "Haryanvi"},

    # === Bhojpuri ===
    {"id": "pawan-singh", "name": "Pawan Singh", "youtube_channel_id": "UCW2NVP4SSkJiS-GVNc5CWMA", "spotify_id": "7iJrDbKM5fEkGdm5RO3dCn", "genre": "Bhojpuri"},
    {"id": "khesari-lal", "name": "Khesari Lal Yadav", "youtube_channel_id": "UCr0RYQY4QXTpBOe2g_MVrIg", "spotify_id": "3xT3GdBxhXJaAXSYPn5XXB", "genre": "Bhojpuri"},

    # === Bengali ===
    {"id": "anupam-roy", "name": "Anupam Roy", "youtube_channel_id": "UCh1gVPb7_IkKZ84Zy79J76Q", "spotify_id": "1SJOL9HJ08YOn92lFcYf8a", "genre": "Bengali"},
    {"id": "arijit-singh-bengali", "name": "Rupam Islam", "youtube_channel_id": "UCjMGJu4aYuIs6BTnTkp97Xw", "spotify_id": "66ZVo4kYEZN37t4AKXLqmM", "genre": "Bengali Rock"},

    # === Ghazal / Sufi ===
    {"id": "kaifi-khalil", "name": "Kaifi Khalil", "youtube_channel_id": "UC6zO45sGu1P6qGlbF490mIA", "spotify_id": "6KESsBnJkAGIU5nqmBjPQ2", "genre": "Sufi/Pop"},

    # === Labels / Collectives ===
    {"id": "speed-records", "name": "Speed Records", "youtube_channel_id": "UCL5bKKRdqhqjcqNOldL5CBg", "spotify_id": None, "genre": "Label"},
]


def seed_database():
    """Seed the database with Indian artists (non-Bollywood/Tamil/Telugu)."""
    init_db()
    conn = get_connection()

    count = 0
    for artist in ARTISTS:
        upsert_artist(conn, artist)
        count += 1

    conn.commit()
    conn.close()
    print(f"\n✅ Seeded {count} artists into the database")


if __name__ == "__main__":
    seed_database()
