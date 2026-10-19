cmake_minimum_required(VERSION 3.16)
project(uni_ai_md_bridge_android CXX)

get_filename_component(UNI_AI_MD_DEMO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

add_library(uni_ai_md_bridge SHARED uni_ai_md_bridge_jni.cpp)
set_target_properties(uni_ai_md_bridge PROPERTIES PREFIX "" OUTPUT_NAME "libuni-ai-md_bridge")
set_target_properties(uni_ai_md_bridge PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/libs/${ANDROID_ABI}"
  SKIP_BUILD_RPATH TRUE
  BUILD_RPATH ""
  INSTALL_RPATH "")

add_library(libuni-ai-md SHARED IMPORTED)
set_target_properties(libuni-ai-md PROPERTIES
  IMPORTED_LOCATION "${UNI_AI_MD_DEMO_ROOT}/native/prebuilt/android-arm64-v8a/libuni-ai-md.so"
  INTERFACE_INCLUDE_DIRECTORIES "${UNI_AI_MD_DEMO_ROOT}/native/include")

target_include_directories(uni_ai_md_bridge PRIVATE "${UNI_AI_MD_DEMO_ROOT}/native/include")
target_link_libraries(uni_ai_md_bridge PUBLIC libuni-ai-md)
target_compile_features(uni_ai_md_bridge PRIVATE cxx_std_17)

# release 配置去掉调试段和符号表；与 HarmonyOS 桥保持一致，交付的就是 strip 后的字节。
if(CMAKE_BUILD_TYPE STREQUAL "Release" AND CMAKE_STRIP)
  add_custom_command(TARGET uni_ai_md_bridge POST_BUILD
    COMMAND "${CMAKE_STRIP}" --strip-all $<TARGET_FILE:uni_ai_md_bridge>
    COMMENT "Stripping uni_ai_md_bridge")
endif()
